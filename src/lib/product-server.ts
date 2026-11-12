// 商品の読み込み・複製（サーバー側専用。商品詳細API・複製API・OEMで共通）
import { prisma } from "@/lib/db";
import { calcCostBreakdown, type CostBreakdown } from "@/lib/product-cost";
import type { Prisma } from "@/generated/prisma/client";

// 原価情報つきで商品を読む（資材は単価をマスタから解決し、大分類 topCategory を付ける）
export async function loadProductWithCost(id: string) {
  const productRaw = await prisma.product.findUnique({
    where: { id },
    include: {
      costSteps: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      materials: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { material: { select: { fabricWidth: true, unitPrice: true } } },
      },
      inventory: true,
      ownerContact: { select: { id: true, name: true, company: true } },
      flamCodes: { select: { flamCode: true, flamName: true, spec: true }, orderBy: { flamCode: "asc" } },
    },
  });
  if (!productRaw) return null;

  // カテゴリ階層を読み込み、leaf → top のマッピングを作る
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

  // material リレーション の fabricWidth と topCategory をフラットに展開
  return {
    ...productRaw,
    materials: productRaw.materials.map((m) => ({
      ...m,
      // マスタ連動の行は単価をマスタから解決（商品側のコピーは表示・計算に使わない）
      unitPrice: m.material?.unitPrice ?? m.unitPrice,
      isMasterLinked: m.materialId != null && m.material != null,
      fabricWidth: m.material?.fabricWidth ?? null,
      topCategory: getTopName(m.category),
    })),
  };
}

export type ProductWithCost = NonNullable<Awaited<ReturnType<typeof loadProductWithCost>>>;

export function breakdownOf(p: ProductWithCost): CostBreakdown {
  return calcCostBreakdown({
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
    costSteps: p.costSteps,
    materials: p.materials,
  });
}

// 商品を原価データ（工程・生地・資材）ごと複製する。overrides で名前・コード・OEMの依頼主などを上書き
export async function duplicateProduct(id: string, overrides: Partial<Prisma.ProductUncheckedCreateInput> = {}) {
  const src = await prisma.product.findUnique({
    where: { id },
    include: { costSteps: true, materials: true },
  });
  if (!src) return null;

  const base = overrides.code || `${src.code}-copy`;
  let newCode = base;
  let n = 1;
  while (await prisma.product.findUnique({ where: { code: newCode } })) {
    n++;
    newCode = overrides.code ? `${base}-${n}` : `${src.code}-copy${n}`;
  }

  return prisma.product.create({
    data: {
      name: `${src.name}（複製）`,
      series: src.series,
      size: src.size,
      retailPrice: src.retailPrice,
      costRatio: src.costRatio,
      wholesalePrice: src.wholesalePrice,
      salesCost: src.salesCost,
      outboundCost: src.outboundCost,
      mgmtCost: src.mgmtCost,
      cutHeight: src.cutHeight,
      cutWidth: src.cutWidth,
      usedMeters: src.usedMeters,
      sizeW: src.sizeW,
      sizeH: src.sizeH,
      sizeD: src.sizeD,
      weightG: src.weightG,
      leadText: src.leadText,
      tags: src.tags,
      description: src.description,
      active: true,
      ...overrides,
      code: newCode,
      // 工程を複製
      costSteps: {
        create: src.costSteps.map((s) => ({
          step: s.step,
          unitCost: s.unitCost,
          quantity: s.quantity,
          category: s.category,
          subType: s.subType,
          sortOrder: s.sortOrder,
          note: s.note,
        })),
      },
      // 生地・資材を複製
      materials: {
        create: src.materials.map((m) => ({
          materialId: m.materialId,
          name: m.name,
          category: m.category,
          unitPrice: m.unitPrice,
          unitType: m.unitType,
          yieldCount: m.yieldCount,
          usedMeters: m.usedMeters,
          usageCount: m.usageCount,
          pairId: m.pairId,
          sortOrder: m.sortOrder,
          note: m.note,
        })),
      },
    },
  });
}
