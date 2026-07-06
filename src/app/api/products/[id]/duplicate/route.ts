import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/products/[id]/duplicate
// 商品を原価データ（工程・生地・資材）ごと複製する
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const src = await prisma.product.findUnique({
    where: { id },
    include: { costSteps: true, materials: true },
  });
  if (!src) return Response.json({ error: "Not found" }, { status: 404 });

  // 一意なコードを生成（-copy, -copy2, ...）
  let newCode = `${src.code}-copy`;
  let n = 1;
  while (await prisma.product.findUnique({ where: { code: newCode } })) {
    n++;
    newCode = `${src.code}-copy${n}`;
  }

  const dup = await prisma.product.create({
    data: {
      code: newCode,
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

  return Response.json({ ok: true, id: dup.id, code: dup.code });
}
