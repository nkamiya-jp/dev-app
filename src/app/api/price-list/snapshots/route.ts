import { prisma } from "@/lib/db";
import { calcCostBreakdown } from "@/lib/product-cost";
import { getAllMatrixRows } from "@/lib/contact-meta";
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
export async function POST(request: NextRequest) {
  const data = await request.json();
  const name = String(data.name || `価格表 ${new Date().toLocaleDateString("ja-JP")}`);
  const note = data.note || null;

  // 現在の商品データを取得
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      costSteps: true,
      materials: true,
    },
  });

  // カテゴリ階層を読み込み
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

  const matrixRows = getAllMatrixRows();

  // スナップショット作成
  const snap = await prisma.priceListSnapshot.create({
    data: {
      name,
      note,
      snappedAt: new Date(),
    },
  });

  // 各商品の価格を保存
  for (const p of products) {
    const breakdown = calcCostBreakdown({
      salesCost: p.salesCost,
      packagingCost: p.packagingCost,
      shippingCost: p.shippingCost,
      outboundCost: p.outboundCost,
      mgmtCost: p.mgmtCost,
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
        unitPrice: m.unitPrice,
        unitType: m.unitType,
        yieldCount: m.yieldCount,
        usedMeters: m.usedMeters,
        usageCount: m.usageCount,
        topCategory: getTopName(m.category),
      })),
    });
    const cost = Math.round(breakdown.total);
    const retail = p.retailPrice ?? 0;
    const prices: Record<string, number> = {};
    for (const r of matrixRows) {
      const key = `${r.typeId}_${r.ratePct}`;
      prices[key] = retail > 0 ? Math.round(retail * r.ratePct / 100) : 0;
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
