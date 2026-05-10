import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST - 材料追加
export async function POST(request: NextRequest) {
  const data = await request.json();

  // 資材マスタ参照の場合はマスタの値で初期化
  let base = {
    name: data.name,
    category: data.category || "other",
    unitPrice: Number(data.unitPrice) || 0,
    unitType: data.unitType || "piece",
    yieldCount: Number(data.yieldCount) || 1,
  };

  if (data.materialId) {
    const master = await prisma.material.findUnique({ where: { id: data.materialId } });
    if (master) {
      base = {
        name: master.name,
        category: master.category,
        unitPrice: master.unitPrice,
        unitType: master.unitType,
        yieldCount: data.yieldCount ? Number(data.yieldCount) : (master.defaultYield || 1),
      };
    }
  }

  const item = await prisma.productMaterial.create({
    data: {
      productId: data.productId,
      materialId: data.materialId || null,
      ...base,
      sortOrder: data.sortOrder ?? 0,
      note: data.note || null,
    },
  });
  return Response.json(item);
}

// PUT - 材料更新
export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  const item = await prisma.productMaterial.update({
    where: { id },
    data: {
      ...(rest.materialId !== undefined && { materialId: rest.materialId || null }),
      ...(rest.name !== undefined && { name: rest.name }),
      ...(rest.category !== undefined && { category: rest.category }),
      ...(rest.unitPrice !== undefined && { unitPrice: Number(rest.unitPrice) || 0 }),
      ...(rest.unitType !== undefined && { unitType: rest.unitType }),
      ...(rest.yieldCount !== undefined && { yieldCount: Number(rest.yieldCount) || 1 }),
      ...(rest.sortOrder !== undefined && { sortOrder: rest.sortOrder }),
      ...(rest.note !== undefined && { note: rest.note || null }),
    },
  });
  return Response.json(item);
}

// DELETE
export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.productMaterial.delete({ where: { id } });
  return Response.json({ ok: true });
}
