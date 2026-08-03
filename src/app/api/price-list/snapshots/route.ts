import { prisma } from "@/lib/db";
import { calcCostBreakdown } from "@/lib/product-cost";
import { getAllMatrixRows, getContactTypeMeta } from "@/lib/contact-meta";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET - スナップショット一覧
export async function GET() {
  const snaps = await prisma.priceListSnapshot.findMany({
    orderBy: { snappedAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
  return Response.json(snaps);
}

// POST - 現在の価格でスナップショットを保存
// body: { name, note, kind?: "matrix"|"customer", contactId? }
export async function POST(request: NextRequest) {
  const data = await request.json();
  const kind = data.kind === "customer" ? "customer" : "matrix";
  const note = data.note || null;

  // 現在の商品データを取得（原価計算に必要な関連も）
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      costSteps: true,
      materials: { include: { material: { select: { fabricWidth: true, unitPrice: true } } } },
    },
  });

  // カテゴリ階層を読み込み（leaf → top）
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

  // 商品ごとの原価を算出するヘルパー
  function costOf(p: (typeof products)[number]): number {
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
    return Math.round(breakdown.total);
  }

  // ─── 顧客別アーカイブ ───
  if (kind === "customer") {
    const contactId = String(data.contactId || "");
    if (!contactId) {
      return Response.json({ error: "contactId is required" }, { status: 400 });
    }
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }
    const rate = contact.discountRate ?? getContactTypeMeta(contact.type)?.defaultRate ?? null;
    if (rate == null) {
      return Response.json({ error: "この顧客は掛率が未設定です" }, { status: 400 });
    }

    // 取扱商品（個別価格・メモ）
    const custPrices = await prisma.customerPrice.findMany({ where: { contactId } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const name = String(
      data.name || `${contact.name} 価格表 ${new Date().toLocaleDateString("ja-JP")}`
    );
    const snap = await prisma.priceListSnapshot.create({
      data: {
        name,
        note,
        kind: "customer",
        contactId: contact.id,
        contactName: contact.name,
        contactRate: Math.round(rate),
        snappedAt: new Date(),
      },
    });

    let count = 0;
    for (const cp of custPrices) {
      const p = productMap.get(cp.productId);
      if (!p) continue; // 非アクティブ/削除済みはスキップ
      const cost = costOf(p);
      const retail = p.retailPrice ?? 0;
      const auto = retail > 0 ? Math.round((retail * rate) / 100) : 0;
      const override = cp.price ?? null;
      const wholesale = override ?? auto;
      await prisma.priceListItem.create({
        data: {
          snapshotId: snap.id,
          productId: p.id,
          productCode: p.code,
          productName: p.name,
          series: p.series,
          cost,
          retailPrice: retail,
          prices: JSON.stringify({ wholesale, auto, override: override != null ? 1 : 0 }),
          note: cp.note ?? null,
        },
      });
      count++;
    }

    return Response.json({ ok: true, snapshot: snap, itemCount: count });
  }

  // ─── 全体アーカイブ（従来）───
  const name = String(data.name || `価格表 ${new Date().toLocaleDateString("ja-JP")}`);
  const matrixRows = getAllMatrixRows();

  const snap = await prisma.priceListSnapshot.create({
    data: { name, note, kind: "matrix", snappedAt: new Date() },
  });

  for (const p of products) {
    const cost = costOf(p);
    const retail = p.retailPrice ?? 0;
    const prices: Record<string, number> = {};
    for (const r of matrixRows) {
      const key = `${r.typeId}_${r.ratePct}`;
      prices[key] = retail > 0 ? Math.round((retail * r.ratePct) / 100) : 0;
    }
    await prisma.priceListItem.create({
      data: {
        snapshotId: snap.id,
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        series: p.series,
        cost,
        retailPrice: retail,
        prices: JSON.stringify(prices),
      },
    });
  }

  return Response.json({ ok: true, snapshot: snap, itemCount: products.length });
}

// DELETE - スナップショット削除
export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.priceListSnapshot.delete({ where: { id } });
  return Response.json({ ok: true });
}
