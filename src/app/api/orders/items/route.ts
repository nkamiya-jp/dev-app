import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const data = await request.json();
  const item = await prisma.orderItem.create({
    data: {
      orderId: data.orderId,
      productId: data.productId,
      quantity: Number(data.quantity),
      unitPrice: data.unitPrice ?? null,
      monthlyPlans: data.monthlyPlans ? JSON.stringify(data.monthlyPlans) : null,
    },
  });
  return Response.json(item);
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  const item = await prisma.orderItem.update({
    where: { id },
    data: {
      ...(rest.quantity !== undefined && { quantity: Number(rest.quantity) }),
      ...(rest.unitPrice !== undefined && { unitPrice: rest.unitPrice }),
      ...(rest.monthlyPlans !== undefined && {
        monthlyPlans: rest.monthlyPlans ? JSON.stringify(rest.monthlyPlans) : null,
      }),
      ...(rest.shippedQty !== undefined && { shippedQty: Number(rest.shippedQty) }),
    },
  });
  return Response.json(item);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.orderItem.delete({ where: { id } });
  return Response.json({ ok: true });
}
