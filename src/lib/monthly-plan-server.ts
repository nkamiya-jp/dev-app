// 月の収支計画（サーバー側専用）
import { prisma } from "@/lib/db";
import { CONTACT_TYPES, getContactTypeLabel, getContactTypeMeta } from "@/lib/contact-meta";
import { breakdownOf, loadProductWithCost } from "@/lib/product-server";
import { getRoadmapSettings, todayJst } from "@/lib/roadmap/settings";
import {
  CHANNEL_COST_KEY, MONTHLY_OVERRIDES_KEY, normalizeChannelCosts, requiredSales, sellingCostPerUnit, termMonths,
  type ChannelCost, type MonthOverride,
} from "@/lib/monthly-plan";

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

export async function getOverrides(): Promise<Record<string, MonthOverride>> {
  const row = await prisma.appSetting.findUnique({ where: { key: MONTHLY_OVERRIDES_KEY } });
  try {
    return row ? JSON.parse(row.value) : {};
  } catch {
    return {};
  }
}

export async function saveOverride(month: string, o: MonthOverride) {
  const all = await getOverrides();
  const clean = (v: unknown) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v))));
  const next: MonthOverride = { ...all[month] };
  for (const k of ["requiredSales", "purchase", "ad"] as const) if (k in o) next[k] = clean(o[k]);
  all[month] = next;
  await prisma.appSetting.upsert({
    where: { key: MONTHLY_OVERRIDES_KEY },
    update: { value: JSON.stringify(all) },
    create: { key: MONTHLY_OVERRIDES_KEY, value: JSON.stringify(all) },
  });
  return next;
}

// 顧客の単価（受注画面と同じ優先順：顧客別価格 → 上代×顧客の掛率 → 標準卸価格）
export function contactUnitPrice(
  product: { retailPrice: number | null; wholesalePrice: number | null },
  contact: { type: string | null; discountRate: number | null } | null | undefined,
  override: number | null | undefined
): { price: number; source: "individual" | "auto" | "standard" | "none" } {
  if (override != null) return { price: override, source: "individual" };
  const rate = contact?.discountRate ?? getContactTypeMeta(contact?.type)?.defaultRate ?? null;
  if (rate != null && product.retailPrice && product.retailPrice > 0) return { price: Math.round((product.retailPrice * rate) / 100), source: "auto" };
  if (product.wholesalePrice != null) return { price: product.wholesalePrice, source: "standard" };
  return { price: 0, source: "none" };
}

const num = (v: string | undefined, d = 0) => {
  const n = Number(v);
  return isNaN(n) ? d : n;
};

interface ProductInfo {
  id: string;
  code: string;
  name: string;
  cost: number; // 合計原価
  purchasePerUnit: number; // 1個つくるのに仕入れる額（生地・資材・梱包資材、仕入品は仕入単価）
  stock: number;
  retailPrice: number | null;
  wholesalePrice: number | null;
}

async function loadProducts(ids: string[]): Promise<Map<string, ProductInfo>> {
  const out = new Map<string, ProductInfo>();
  for (const id of ids) {
    const p = await loadProductWithCost(id);
    if (!p) continue;
    const b = breakdownOf(p);
    out.set(id, {
      id,
      code: p.code,
      name: p.name,
      cost: Math.round(b.total),
      purchasePerUnit: Math.round(b.fabricCost + b.materialCost + b.packagingMaterialCost + b.purchaseCost),
      stock: p.inventory?.stock ?? 0,
      retailPrice: p.retailPrice,
      wholesalePrice: p.wholesalePrice,
    });
  }
  return out;
}

export async function buildMonthlyPlan(monthArg: string | null) {
  const s = await getRoadmapSettings();
  const months = termMonths(s.term, { term: s.term, termStart: s.termStart });
  const today = todayJst().slice(0, 7);
  const month = monthArg && months.includes(monthArg) ? monthArg : months.find((m) => m >= today) ?? months[months.length - 1];
  const raw = s.raw;
  const grossRate = 1 - num(raw["仕入率目標"], 52) / 100;
  const adDefault = num(raw["広告費目安"], 200000);

  const first = months[0];
  const [forecasts, productions, budgets, orders, costs, overrides] = await Promise.all([
    prisma.customerForecast.findMany({ where: { month: { in: months } } }),
    prisma.monthlyProduction.findMany({ where: { month: { in: months } } }),
    prisma.monthlyChannelBudget.findMany({ where: { month: { in: months } } }),
    prisma.order.findMany({
      where: {
        status: { not: "cancelled" },
        orderDate: { gte: new Date(`${first}-01T00:00:00+09:00`) }, // 期の終わりより後は下で月を見て外す
      },
      select: { contactId: true, orderDate: true, items: { select: { productId: true, quantity: true } } },
    }),
    getChannelCosts(),
    getOverrides(),
  ]);
  const ymOf = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);

  // 顧客×商品×月 → 受注済み・見込み・攻め
  type Cell = { ordered: number; forecast: number; push: number };
  const cells = new Map<string, Cell>(); // key = month|contactId|productId
  const cell = (m: string, c: string, p: string) => {
    const k = `${m}|${c}|${p}`;
    if (!cells.has(k)) cells.set(k, { ordered: 0, forecast: 0, push: 0 });
    return cells.get(k)!;
  };
  for (const f of forecasts) {
    const c = cell(f.month, f.contactId, f.productId);
    if (f.kind === "push") c.push += f.qty;
    else c.forecast += f.qty;
  }
  for (const o of orders) {
    const m = ymOf(o.orderDate);
    if (!months.includes(m)) continue;
    for (const it of o.items) cell(m, o.contactId, it.productId).ordered += it.quantity;
  }

  const productIds = new Set<string>([...productions.map((x) => x.productId)]);
  const contactIds = new Set<string>();
  for (const k of cells.keys()) {
    const [, c, p] = k.split("|");
    contactIds.add(c);
    productIds.add(p);
  }
  const [products, contacts, overridesPrice] = await Promise.all([
    loadProducts([...productIds]),
    prisma.contact.findMany({ where: { id: { in: [...contactIds] } }, select: { id: true, name: true, company: true, type: true, discountRate: true } }),
    prisma.customerPrice.findMany({ where: { contactId: { in: [...contactIds] }, productId: { in: [...productIds] } }, select: { contactId: true, productId: true, price: true } }),
  ]);
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const priceOv = new Map(overridesPrice.map((o) => [`${o.contactId}|${o.productId}`, o.price]));

  // 行（顧客×商品）の単価・1個の粗利
  const unit = (contactId: string, productId: string) => {
    const p = products.get(productId);
    const c = contactById.get(contactId);
    if (!p) return null;
    const { price, source } = contactUnitPrice(p, c, priceOv.get(`${contactId}|${productId}`));
    const channel = c?.type || "";
    const sellCost = sellingCostPerUnit(price, costs[channel]);
    return { price, priceSource: source, channel, sellCost, unitGross: price - sellCost - p.cost };
  };

  // 月ごとの集計（12か月）と、選んだ月の明細
  const prodQty = (m: string, pid: string) => productions.find((x) => x.month === m && x.productId === pid)?.qty ?? 0;
  const summary = months.map((m) => {
    let expected = 0, push = 0, expectedGross = 0, pushGross = 0, ordered = 0;
    for (const [k, c] of cells) {
      if (!k.startsWith(m + "|")) continue;
      const [, cid, pid] = k.split("|");
      const u = unit(cid, pid);
      if (!u) continue;
      const exp = Math.max(c.ordered, c.forecast); // 見込みは受注済みを含む（多い方）
      expected += exp * u.price;
      expectedGross += exp * u.unitGross;
      push += c.push * u.price;
      pushGross += c.push * u.unitGross;
      ordered += c.ordered * u.price;
    }
    let planPurchase = 0, productionCost = 0;
    for (const pid of productIds) {
      const q = prodQty(m, pid);
      const p = products.get(pid);
      if (!q || !p) continue;
      planPurchase += q * p.purchasePerUnit;
      productionCost += q * p.cost;
    }
    const o = overrides[m] || {};
    const fixed = num(raw[`固定費_${m}`], num(raw["固定費"], 6500000));
    const ad = o.ad ?? adDefault;
    const purchase = o.purchase ?? planPurchase;
    const req = requiredSales({ fixed, ad, purchase, grossRate, purchaseIsManual: o.purchase != null, override: o.requiredSales });
    return {
      month: m,
      fixed, ad, purchase, planPurchase, productionCost,
      purchaseIsManual: o.purchase != null, adIsManual: o.ad != null,
      required: req.amount, requiredBasis: req.basis,
      ordered, expected, push, expectedGross, pushGross,
      gap: req.amount - expected - push, // ＋なら不足
    };
  });

  // 選んだ月の明細：顧客×商品の行
  const lines: {
    contactId: string; contactLabel: string; channel: string; channelLabel: string;
    productId: string; productName: string; productCode: string;
    price: number; priceSource: string; sellCost: number; unitGross: number;
    ordered: number; forecast: number; push: number; expected: number; revenue: number; gross: number;
  }[] = [];
  for (const [k, c] of cells) {
    if (!k.startsWith(month + "|")) continue;
    const [, cid, pid] = k.split("|");
    const u = unit(cid, pid);
    const p = products.get(pid);
    const ct = contactById.get(cid);
    if (!u || !p) continue;
    const expected = Math.max(c.ordered, c.forecast);
    lines.push({
      contactId: cid,
      contactLabel: ct ? ct.company || ct.name : "（削除された顧客）",
      channel: u.channel,
      channelLabel: getContactTypeLabel(u.channel) || "未分類",
      productId: pid,
      productName: p.name,
      productCode: p.code,
      price: u.price,
      priceSource: u.priceSource,
      sellCost: u.sellCost,
      unitGross: u.unitGross,
      ordered: c.ordered,
      forecast: c.forecast,
      push: c.push,
      expected,
      revenue: (expected + c.push) * u.price,
      gross: (expected + c.push) * u.unitGross,
    });
  }
  const chOrder = (ch: string) => {
    const i = CONTACT_TYPES.findIndex((t) => t.id === ch);
    return i < 0 ? 999 : i;
  };
  lines.sort((a, b) => chOrder(a.channel) - chOrder(b.channel) || a.contactLabel.localeCompare(b.contactLabel, "ja") || a.productName.localeCompare(b.productName, "ja"));

  // カテゴリ：見込み・攻めの予算・攻めで割り当て済み
  const channels = [...CONTACT_TYPES.map((t) => ({ id: t.id, label: t.label, ratePct: t.defaultRate })), { id: "", label: "未分類", ratePct: null }].map((t) => {
    const ls = lines.filter((l) => l.channel === t.id);
    const budget = budgets.find((b) => b.month === month && b.channel === t.id)?.amount ?? 0;
    const pushRevenue = ls.reduce((a, l) => a + l.push * l.price, 0);
    return {
      ...t,
      expected: ls.reduce((a, l) => a + l.expected * l.price, 0),
      budget,
      pushRevenue,
      pushGross: ls.reduce((a, l) => a + l.push * l.unitGross, 0),
      remaining: budget - pushRevenue,
      cost: costs[t.id] ?? null,
    };
  });

  // 商品：必要な数（見込み＋攻め）と、在庫・生産の現実（今月から先は在庫を繰り越して見る）
  const needOf = (m: string, pid: string) => {
    let n = 0;
    for (const [k, c] of cells) {
      if (!k.startsWith(m + "|") || !k.endsWith("|" + pid)) continue;
      n += Math.max(c.ordered, c.forecast) + c.push;
    }
    return n;
  };
  const startIdx = Math.max(0, months.indexOf(months.find((m) => m >= today) ?? months[0]));
  const productRows = [...productIds]
    .map((pid) => {
      const p = products.get(pid);
      if (!p) return null;
      // 今月の頭は今の在庫。翌月以降は「前月の頭の在庫＋前月の生産−前月の必要数」で繰り越す
      let stockStart: number | null = null;
      const mi = months.indexOf(month);
      if (mi >= startIdx) {
        stockStart = p.stock;
        for (let i = startIdx; i < mi; i++) stockStart += prodQty(months[i], pid) - needOf(months[i], pid);
      }
      const need = needOf(month, pid);
      const production = prodQty(month, pid);
      return {
        productId: pid,
        name: p.name,
        code: p.code,
        cost: p.cost,
        purchasePerUnit: p.purchasePerUnit,
        need,
        stockStart,
        production,
        balance: stockStart == null ? null : stockStart + production - need, // マイナス＝足りない
        productionCost: production * p.cost,
        purchase: production * p.purchasePerUnit,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && (x.need > 0 || x.production > 0))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return {
    term: s.term,
    months,
    month,
    grossRateTarget: Math.round(grossRate * 1000) / 10,
    current: summary.find((x) => x.month === month)!,
    summary,
    lines,
    channels: channels.filter((c) => c.id !== "" || lines.some((l) => l.channel === "")),
    products: productRows,
  };
}
