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
      contact: { select: { id: true, name: true, company: true, type: true, dailyOrder: true } },
      items: {
        include: {
          product: {
            select: {
              id: true, code: true, name: true, series: true, wholesalePrice: true,
              inventory: { select: { stock: true } },
            },
          },
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

// 進捗段階 ⇔ 従来の status の対応（既存画面と食い違わないよう相互に同期する）
const STAGE_TO_STATUS: Record<string, string> = {
  received: "pending",
  production: "in_progress",
  preparing: "in_progress",
  shipped: "completed",
  cancelled: "cancelled",
};
const STATUS_TO_STAGE: Record<string, string> = {
  completed: "shipped",
  cancelled: "cancelled",
};

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;

  // stage を指定したら status も合わせる。status だけ変えた場合は完了/キャンセルのみ stage に反映
  let stage: string | undefined = rest.stage;
  let status: string | undefined = rest.status;
  if (stage) {
    if (!STAGE_TO_STATUS[stage]) return Response.json({ error: "invalid stage" }, { status: 400 });
    status = STAGE_TO_STATUS[stage];
  } else if (status && STATUS_TO_STAGE[status]) {
    stage = STATUS_TO_STAGE[status];
  }

  const order = await prisma.order.update({
    where: { id },
    data: {
      ...(rest.contactId && { contactId: rest.contactId }),
      ...(rest.orderDate && { orderDate: new Date(rest.orderDate) }),
      ...(rest.dueDate !== undefined && { dueDate: rest.dueDate ? new Date(rest.dueDate) : null }),
      ...(status && { status }),
      ...(stage && { stage, stageUpdatedAt: new Date() }),
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
