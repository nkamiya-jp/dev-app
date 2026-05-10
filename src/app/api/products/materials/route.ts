import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST - 材料追加
export async function POST(request: NextRequest) {
  const data = await request.json();
  const item = await prisma.productMaterial.create({
    data: {
      productId: data.productId,
      name: data.name,
      category: data.category || "other",
      unitPrice: Number(data.unitPrice) || 0,
      unitType: data.unitType || "piece",
      yieldCount: Number(data.yieldCount) || 1,
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
