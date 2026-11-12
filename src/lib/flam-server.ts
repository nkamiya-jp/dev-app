// FLAM（販売管理）の商品コードとDEV商品の紐づけ（サーバー側専用）
// 紐づけたら、保存済みの FlamPrice（得意先×商品の直近出荷単価）から顧客別単価を作る。
import { prisma } from "@/lib/db";

export type FlamLinkResult = {
  codes: string[];
  added: string[];
  removed: string[];
  // 作った顧客別単価
  created: { contactId: string; contactName: string; price: number; note: string }[];
  // 既に顧客別単価があったので触らなかった顧客数
  keptExisting: number;
  // FLAMの得意先がDEV顧客に紐づいていないため作れなかった件数
  noContact: number;
};

export class FlamLinkError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function normalizeCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) return [];
  const out: string[] = [];
  for (const c of codes) {
    const s = String(c ?? "").trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

// 商品に紐づくFLAMコードを codes に置き換え、顧客別単価を補完する
export async function setProductFlamCodes(productId: string, rawCodes: unknown): Promise<FlamLinkResult> {
  const codes = normalizeCodes(rawCodes);
  const current = await prisma.flamProductMap.findMany({ where: { productId }, select: { flamCode: true } });
  const currentCodes = current.map((c) => c.flamCode);
  const added = codes.filter((c) => !currentCodes.includes(c));
  const removed = currentCodes.filter((c) => !codes.includes(c));

  if (added.length > 0) {
    const rows = await prisma.flamProductMap.findMany({ where: { flamCode: { in: added } } });
    const missing = added.filter((c) => !rows.some((r) => r.flamCode === c));
    if (missing.length) throw new FlamLinkError(`FLAMコードが見つかりません: ${missing.join(", ")}`);
    const excluded = rows.filter((r) => r.status === "excluded");
    if (excluded.length) throw new FlamLinkError(`商品ではないコードです: ${excluded.map((r) => r.flamCode).join(", ")}`);
    const taken = rows.filter((r) => r.productId && r.productId !== productId);
    if (taken.length) {
      const prods = await prisma.product.findMany({
        where: { id: { in: taken.map((r) => r.productId!) } },
        select: { id: true, code: true, name: true },
      });
      const msg = taken.map((r) => {
        const p = prods.find((x) => x.id === r.productId);
        return `${r.flamCode}（${p ? `${p.code} ${p.name}` : "別の商品"}）`;
      });
      throw new FlamLinkError(`別の商品に紐づいています: ${msg.join(", ")}`);
    }
  }

  // 単文の updateMany だけで済ませる（大きな $transaction は Turso 本番で P2028 になる）
  if (removed.length) {
    await prisma.flamProductMap.updateMany({
      where: { flamCode: { in: removed }, productId },
      data: { productId: null, status: "unmapped" },
    });
  }
  if (added.length) {
    await prisma.flamProductMap.updateMany({
      where: { flamCode: { in: added } },
      data: { productId, status: "mapped" },
    });
  }

  const fill = await fillCustomerPricesFromFlam(productId, codes);
  return { codes, added, removed, ...fill };
}

// FlamPrice から顧客別単価を作る。既存の顧客別単価は上書きしない。
// 複数コードが同じ得意先にあるときは lastMonth が新しい方（同月なら出荷数の多い方）。
export async function fillCustomerPricesFromFlam(productId: string, codes: string[]) {
  const empty = { created: [] as FlamLinkResult["created"], keptExisting: 0, noContact: 0 };
  if (codes.length === 0) return empty;

  const prices = await prisma.flamPrice.findMany({
    where: { flamProductCode: { in: codes }, lastPrice: { not: null }, lastMonth: { not: null } },
  });
  if (prices.length === 0) return empty;

  const contacts = await prisma.contact.findMany({
    where: { flamCode: { in: [...new Set(prices.map((p) => p.flamCustomerCode))] } },
    select: { id: true, name: true, company: true, flamCode: true },
  });
  const contactByFlam = new Map(contacts.map((c) => [c.flamCode!, c]));

  type Pick = { contactId: string; contactName: string; price: number; month: string; qty: number; code: string };
  const best = new Map<string, Pick>();
  const noContactCustomers = new Set<string>();
  for (const p of prices) {
    const c = contactByFlam.get(p.flamCustomerCode);
    if (!c) {
      noContactCustomers.add(p.flamCustomerCode);
      continue;
    }
    const cand: Pick = {
      contactId: c.id,
      contactName: c.company || c.name,
      price: p.lastPrice!,
      month: p.lastMonth!,
      qty: p.qty12,
      code: p.flamProductCode,
    };
    const cur = best.get(c.id);
    if (!cur || cand.month > cur.month || (cand.month === cur.month && cand.qty > cur.qty)) best.set(c.id, cand);
  }

  const existing = await prisma.customerPrice.findMany({
    where: { productId, contactId: { in: [...best.keys()] } },
    select: { contactId: true },
  });
  const existingIds = new Set(existing.map((e) => e.contactId));
  const toCreate = [...best.values()].filter((b) => !existingIds.has(b.contactId));

  const created = toCreate.map((b) => ({
    contactId: b.contactId,
    contactName: b.contactName,
    price: b.price,
    note: `FLAM実績 ${b.month}（${b.code}）`,
  }));
  if (created.length) {
    await prisma.customerPrice.createMany({
      data: created.map((c) => ({ contactId: c.contactId, productId, price: c.price, note: c.note })),
    });
  }
  return { created, keptExisting: existingIds.size, noContact: noContactCustomers.size };
}
