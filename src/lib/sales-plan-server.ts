// 販売計画シミュレーション（サーバー側専用）：計画を読み、単価・販売コストを付けて計算する
import { prisma } from "@/lib/db";
import { CONTACT_TYPES, getContactTypeLabel, getContactTypeMeta } from "@/lib/contact-meta";
import { breakdownOf, loadProductWithCost } from "@/lib/product-server";
import { getRoadmapSettings } from "@/lib/roadmap/settings";
import {
  CHANNEL_COST_KEY, computePlan, normalizeChannelCosts, sellingCostPerUnit, termMonths,
  type ChannelCost, type PlanRow,
} from "@/lib/sales-plan";

export async function getChannelCosts(): Promise<Record<string, ChannelCost>> {
  const row = await prisma.appSetting.findUnique({ where: { key: CHANNEL_COST_KEY } });
  try {
    return normalizeChannelCosts(row ? JSON.parse(row.value) : null);
  } catch {
    return {};
  }
}

export async function saveChannelCosts(v: unknown) {
  const c = normalizeChannelCosts(v);
  await prisma.appSetting.upsert({
    where: { key: CHANNEL_COST_KEY },
    update: { value: JSON.stringify(c) },
    create: { key: CHANNEL_COST_KEY, value: JSON.stringify(c) },
  });
  return c;
}

export async function monthsForTerm(term: string) {
  const s = await getRoadmapSettings();
  return termMonths(term, { term: s.term, termStart: s.termStart });
}

// カテゴリの単価：上代 × そのカテゴリの既定掛率（価格表と同じ）。上代が無ければ標準卸価格
function channelPrice(channel: string, retail: number | null, wholesale: number | null) {
  const rate = getContactTypeMeta(channel)?.defaultRate ?? null;
  if (rate != null && retail && retail > 0) return { price: Math.round((retail * rate) / 100), source: "channel" as const };
  if (wholesale != null) return { price: wholesale, source: "standard" as const };
  return { price: 0, source: "none" as const };
}

export async function buildPlanView(planId: string) {
  const plan = await prisma.salesPlan.findUnique({
    where: { id: planId },
    include: { cells: true },
  });
  if (!plan) return null;
  const p = await loadProductWithCost(plan.productId);
  if (!p) return null;
  const cost = Math.round(breakdownOf(p).total);
  const [months, costs] = await Promise.all([monthsForTerm(plan.term), getChannelCosts()]);

  // 顧客ごとの単価（受注画面と同じ優先順：顧客別価格 → 上代×顧客の掛率 → 標準卸価格）
  const contactIds = [...new Set(plan.cells.map((c) => c.contactId).filter((x): x is string => !!x))];
  const [contacts, overrides] = await Promise.all([
    prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true, company: true, type: true, discountRate: true } }),
    prisma.customerPrice.findMany({ where: { productId: p.id, contactId: { in: contactIds } }, select: { contactId: true, price: true } }),
  ]);
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const ovByContact = new Map(overrides.map((o) => [o.contactId, o.price]));

  const makeRow = (channel: string, contactId: string | null): Omit<PlanRow, "qty"> => {
    let price: number;
    let priceSource: PlanRow["priceSource"];
    let label = "顧客未定";
    if (contactId) {
      const c = contactById.get(contactId);
      label = c ? c.company || c.name : "（削除された顧客）";
      const rate = c?.discountRate ?? getContactTypeMeta(c?.type)?.defaultRate ?? null;
      const ov = ovByContact.get(contactId);
      if (ov != null) { price = ov; priceSource = "individual"; }
      else if (rate != null && p.retailPrice && p.retailPrice > 0) { price = Math.round((p.retailPrice * rate) / 100); priceSource = "auto"; }
      else if (p.wholesalePrice != null) { price = p.wholesalePrice; priceSource = "standard"; }
      else { price = 0; priceSource = "none"; }
    } else {
      const cp = channelPrice(channel, p.retailPrice, p.wholesalePrice);
      price = cp.price;
      priceSource = cp.source;
    }
    const sellCost = sellingCostPerUnit(price, costs[channel]);
    return {
      key: `${channel}|${contactId ?? ""}`,
      channel,
      contactId,
      label,
      price,
      priceSource,
      sellCost,
      unitNet: price - sellCost,
      unitGross: price - sellCost - cost,
    };
  };

  const production: Record<string, number> = {};
  const rowMap = new Map<string, PlanRow>();
  for (const c of plan.cells) {
    if (c.kind === "production") {
      production[c.month] = (production[c.month] || 0) + c.qty;
      continue;
    }
    const channel = c.channel || "";
    const key = `${channel}|${c.contactId ?? ""}`;
    if (!rowMap.has(key)) rowMap.set(key, { ...makeRow(channel, c.contactId), qty: {} });
    const r = rowMap.get(key)!;
    r.qty[c.month] = (r.qty[c.month] || 0) + c.qty;
  }
  // 並び：カテゴリは価格表の順、同じカテゴリの中は「顧客未定」を先に
  const order = (ch: string) => {
    const i = CONTACT_TYPES.findIndex((t) => t.id === ch);
    return i < 0 ? 999 : i;
  };
  const rows = [...rowMap.values()].sort(
    (a, b) => order(a.channel) - order(b.channel) || Number(!!a.contactId) - Number(!!b.contactId) || a.label.localeCompare(b.label, "ja")
  );

  // カテゴリ別の1個あたり（どこに売ると儲かるかの比較用）
  const channels = CONTACT_TYPES.map((t) => {
    const r = makeRow(t.id, null);
    return { id: t.id, label: t.label, ratePct: t.defaultRate, price: r.price, sellCost: r.sellCost, unitGross: r.unitGross, cost: costs[t.id] ?? null };
  });

  return {
    plan: { id: plan.id, name: plan.name, term: plan.term, note: plan.note, adopted: plan.adopted, openingStock: plan.openingStock, updatedAt: plan.updatedAt },
    product: { id: p.id, code: p.code, name: p.name, retailPrice: p.retailPrice, cost, stock: p.inventory?.stock ?? 0 },
    months,
    production,
    rows: rows.map((r) => ({ ...r, channelLabel: getContactTypeLabel(r.channel) || "未分類" })),
    channels,
    result: computePlan({ months, cost, production, rows, openingStock: plan.openingStock }),
  };
}
