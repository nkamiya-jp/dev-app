import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST - 工程追加
export async function POST(request: NextRequest) {
  const data = await request.json();
  const item = await prisma.productCostStep.create({
    data: {
      productId: data.productId,
      step: data.step,
      unitCost: Number(data.unitCost) || 0,
      quantity: Number(data.quantity) || 1,
      category: data.category || "制作費",
      subType: data.subType || null,
      sortOrder: data.sortOrder ?? 0,
      note: data.note || null,
    },
  });
  return Response.json(item);
}

// PUT - 工程更新
export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  const item = await prisma.productCostStep.update({
    where: { id },
    data: {
      ...(rest.step !== undefined && { step: rest.step }),
      ...(rest.unitCost !== undefined && { unitCost: Number(rest.unitCost) || 0 }),
      ...(rest.quantity !== undefined && { quantity: Number(rest.quantity) || 1 }),
      ...(rest.category !== undefined && { category: rest.category }),
      ...(rest.subType !== undefined && { subType: rest.subType || null }),
      ...(rest.sortOrder !== undefined && { sortOrder: rest.sortOrder }),
      ...(rest.note !== undefined && { note: rest.note || null }),
    },
  });
  return Response.json(item);
}

// DELETE
export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.productCostStep.delete({ where: { id } });
  return Response.json({ ok: true });
}
