import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface OrderItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number | null;
  monthlyPlans?: Record<string, number> | null;
}

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  const contactId = request.nextUrl.searchParams.get("contactId");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (contactId) where.contactId = contactId;

  const orders = await prisma.order.findMany({
    where,
    include: {
      contact: { select: { id: true, name: true, company: true, type: true } },
      items: {
        include: {
          product: { select: { id: true, code: true, name: true, series: true, wholesalePrice: true } },
        },
      },
    },
    orderBy: { orderDate: "desc" },
  });
  return Response.json(orders);
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const order = await prisma.order.create({
    data: {
      contactId: data.contactId,
      orderDate: new Date(data.orderDate || new Date()),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      status: data.status || "pending",
      note: data.note || null,
      items: {
        create: (data.items || []).map((it: OrderItemInput) => ({
          productId: it.productId,
          quantity: Number(it.quantity),
          unitPrice: it.unitPrice ?? null,
          monthlyPlans: it.monthlyPlans ? JSON.stringify(it.monthlyPlans) : null,
        })),
      },
    },
    include: { items: true },
  });
  return Response.json(order);
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  const order = await prisma.order.update({
    where: { id },
    data: {
      ...(rest.contactId && { contactId: rest.contactId }),
      ...(rest.orderDate && { orderDate: new Date(rest.orderDate) }),
      ...(rest.dueDate !== undefined && { dueDate: rest.dueDate ? new Date(rest.dueDate) : null }),
      ...(rest.status && { status: rest.status }),
      ...(rest.note !== undefined && { note: rest.note || null }),
    },
  });
  return Response.json(order);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.order.delete({ where: { id } });
  return Response.json({ ok: true });
}
