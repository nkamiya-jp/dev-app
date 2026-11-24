// 顧客別の価格表（取扱商品×卸価格）と価格改定（新価格の下書き・確定・履歴の保存）。サーバー側専用
import { prisma } from "@/lib/db";
import { calcCostBreakdown } from "@/lib/product-cost";
import { getContactTypeMeta, resolveRate } from "@/lib/contact-meta";
import { compareProductOrder } from "@/lib/product-meta";
import { roundSellPrice } from "@/lib/pricing";

// ─── 原価 ───
// 価格表の保存（スナップショット）で使う。商品の原価計算に必要な関連ごと読む
export async function loadProductsWithCost(where: Record<string, unknown>) {
  const products = await prisma.product.findMany({
    where,
    include: {
      costSteps: true,
      materials: { include: { material: { select: { fabricWidth: true, unitPrice: true } } } },
    },
  });
  const cats = await prisma.materialCategory.findMany();
  const byId = new Map(cats.map((c) => [c.id, c]));
  function getTopName(leafName: string): string {
    let cur = cats.find((c) => c.name === leafName);
    while (cur && cur.parentId) {
      const p = byId.get(cur.parentId);
      if (!p) break;
      cur = p;
    }
    return cur?.name ?? leafName;
  }
  return products.map((p) => {
    const breakdown = calcCostBreakdown({
      salesCost: p.salesCost,
      packagingCost: p.packagingCost,
      shippingCost: p.shippingCost,
      outboundCost: p.outboundCost,
      mgmtCost: p.mgmtCost,
      purchaseCost: p.purchaseCost,
      isPurchase: p.series === "purchase",
      cutHeight: p.cutHeight,
      cutWidth: p.cutWidth,
      usedMeters: p.usedMeters,
      costSteps: p.costSteps.map((s) => ({
        id: s.id,
        step: s.step,
        unitCost: s.unitCost,
        quantity: s.quantity,
        category: s.category,
        subType: s.subType,
      })),
      materials: p.materials.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        unitPrice: m.material?.unitPrice ?? m.unitPrice,
        unitType: m.unitType,
        yieldCount: m.yieldCount,
        usedMeters: m.usedMeters,
        usageCount: m.usageCount,
        fabricWidth: m.material?.fabricWidth ?? null,
        topCategory: getTopName(m.category),
      })),
    });
    return { ...p, cost: Math.round(breakdown.total) };
  });
}

// ─── 顧客の価格表（いまの価格） ───
export interface CustomerPriceRow {
  productId: string;
  code: string;
  name: string;
  series: string | null;
  cost: number;
  retail: number;
  rate: number | null;     // この商品に使う掛率
  autoRaw: number;         // 上代×掛率の実数値
  auto: number;            // 上代×掛率（20円単位に切り上げ）
  override: number | null; // 個別価格（FLAMで確認した価格など）
  wholesale: number;       // いまの卸価格（個別 ＞ 自動）
  note: string | null;
}

export async function loadCustomerPriceList(contactId: string) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return null;
  const rate = contact.discountRate ?? getContactTypeMeta(contact.type)?.defaultRate ?? null;
  const custPrices = await prisma.customerPrice.findMany({ where: { contactId } });
  const products = await loadProductsWithCost({
    active: true,
    id: { in: custPrices.map((c) => c.productId) },
    // OEM商品は依頼主のこの顧客の分だけ
    OR: [{ ownerContactId: null }, { ownerContactId: contactId }],
  });
  const cpMap = new Map(custPrices.map((c) => [c.productId, c]));
  const rows: CustomerPriceRow[] = [...products].sort(compareProductOrder).map((p) => {
    const cp = cpMap.get(p.id);
    const retail = p.retailPrice ?? 0;
    const r = resolveRate(contact, p.typeRates);
    const autoRaw = r != null && retail > 0 ? (retail * r) / 100 : 0;
    const auto = roundSellPrice(autoRaw);
    const override = cp?.price ?? null;
    return {
      productId: p.id,
      code: p.code,
      name: p.name,
      series: p.series,
      cost: p.cost,
      retail,
      rate: r,
      autoRaw,
      auto,
      override,
      wholesale: override ?? auto,
      note: cp?.note ?? null,
    };
  });
  return { contact, rate, rows };
}

export function contactDisplayName(c: { company: string | null; name: string }) {
  return c.company || c.name;
}

// ─── 価格表の保存（PDFの元になる控え） ───
export async function saveCustomerSnapshot(
  contactId: string,
  opts: { name?: string; note?: string | null; stage?: "current" | "revised" } = {},
) {
  const list = await loadCustomerPriceList(contactId);
  if (!list) throw new Error("Contact not found");
  const { contact, rate, rows } = list;
  const display = contactDisplayName(contact);
  const today = new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
  const snap = await prisma.priceListSnapshot.create({
    data: {
      name: opts.name || `${display} 価格表 ${today}`,
      note: opts.note ?? null,
      kind: "customer",
      contactId: contact.id,
      contactName: display,
      contactRate: rate != null ? Math.round(rate) : null,
      snappedAt: new Date(),
    },
  });
  if (rows.length > 0) {
    // 1回のINSERTでまとめて入れる（大きなトランザクションを避ける）
    await prisma.priceListItem.createMany({
      data: rows.map((r, i) => ({
        snapshotId: snap.id,
        productId: r.productId,
        productCode: r.code,
        productName: r.name,
        series: r.series,
        cost: r.cost,
        retailPrice: r.retail,
        prices: JSON.stringify({
          wholesale: r.wholesale,
          auto: r.auto,
          autoRaw: Math.round(r.autoRaw * 100) / 100,
          override: r.override != null ? 1 : 0,
          order: i,
          ...(opts.stage ? { stage: opts.stage } : {}),
        }),
        note: r.note,
      })),
    });
  }
  return { snapshot: snap, itemCount: rows.length, rows };
}

// いまの価格が直近の控えと同じか（同じなら控えを重ねて作らない）
export async function latestSnapshotMatches(contactId: string, rows: CustomerPriceRow[]) {
  const last = await prisma.priceListSnapshot.findFirst({
    where: { kind: "customer", contactId },
    orderBy: { snappedAt: "desc" },
    include: { items: true },
  });
  if (!last) return null;
  if (last.items.length !== rows.length) return { snapshot: last, same: false };
  const byId = new Map(last.items.map((it) => [it.productId, it]));
  const same = rows.every((r) => {
    const it = byId.get(r.productId);
    if (!it) return false;
    try {
      const p = JSON.parse(it.prices) as { wholesale?: number };
      return p.wholesale === r.wholesale && (it.retailPrice ?? 0) === r.retail;
    } catch {
      return false;
    }
  });
  return { snapshot: last, same };
}

// ─── 新価格の下書き（確定までは AppSetting に置く。DBの変更なしで使える） ───
const revisionKey = (contactId: string) => `price-revision:${contactId}`;

export interface RevisionDraft {
  prices: Record<string, number>; // productId → 新価格
  updatedAt: string | null;
}

export async function getRevisionDraft(contactId: string): Promise<RevisionDraft> {
  const row = await prisma.appSetting.findUnique({ where: { key: revisionKey(contactId) } });
  if (!row) return { prices: {}, updatedAt: null };
  try {
    const v = JSON.parse(row.value) as { prices?: Record<string, unknown> };
    const prices: Record<string, number> = {};
    for (const [k, n] of Object.entries(v.prices ?? {})) {
      const x = Number(n);
      if (Number.isFinite(x) && x > 0) prices[k] = Math.round(x);
    }
    return { prices, updatedAt: row.updatedAt.toISOString() };
  } catch {
    return { prices: {}, updatedAt: null };
  }
}

export async function saveRevisionDraft(contactId: string, prices: Record<string, number>) {
  if (Object.keys(prices).length === 0) {
    await prisma.appSetting.deleteMany({ where: { key: revisionKey(contactId) } });
    return { prices: {}, updatedAt: null } as RevisionDraft;
  }
  const value = JSON.stringify({ prices });
  const row = await prisma.appSetting.upsert({
    where: { key: revisionKey(contactId) },
    update: { value },
    create: { key: revisionKey(contactId), value },
  });
  return { prices, updatedAt: row.updatedAt.toISOString() } as RevisionDraft;
}
