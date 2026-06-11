import { prisma } from "@/lib/db";
import { calcCostBreakdown } from "@/lib/product-cost";
import { getAllMatrixRows } from "@/lib/contact-meta";

export const dynamic = "force-dynamic";

// GET /api/price-list - 現在のリアルタイム価格表（全商品 × 顧客タイプ別掛率）
export async function GET() {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      costSteps: true,
      materials: { include: { material: { select: { fabricWidth: true } } } },
    },
    orderBy: [{ series: "asc" }, { code: "asc" }],
  });

  // カテゴリ階層を読み込み、leaf → top のマッピング
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

  const items = products.map((p) => {
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
    const cost = breakdown.total;
    const retail = p.retailPrice ?? 0;
    const prices: Record<string, { ratePct: number; price: number; profit: number; profitRate: number }> = {};
    for (const r of matrixRows) {
      const key = `${r.typeId}_${r.ratePct}`;
      const price = retail > 0 ? Math.round(retail * r.ratePct / 100) : 0;
      const profit = price - cost;
      const profitRate = price > 0 ? (profit / price) * 100 : 0;
      prices[key] = { ratePct: r.ratePct, price, profit, profitRate };
    }
    return {
      productId: p.id,
      code: p.code,
      name: p.name,
      series: p.series,
      size: p.size,
      cost: Math.round(cost),
      retailPrice: retail,
      wholesalePrice: p.wholesalePrice,
      prices,
    };
  });

  return Response.json({
    matrixRows, // ヘッダ用
    items,
    generatedAt: new Date().toISOString(),
  });
}
