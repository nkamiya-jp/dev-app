import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface AssignmentInput {
  workerId: string;
  step?: string | null;
  quantity: number;
  note?: string | null;
}

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  const productId = request.nextUrl.searchParams.get("productId");
  const workerId = request.nextUrl.searchParams.get("workerId");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (productId) where.productId = productId;
  if (workerId) {
    where.assignments = { some: { workerId } };
  }

  const productions = await prisma.production.findMany({
    where,
    include: {
      product: { select: { id: true, code: true, name: true, series: true, workerCost: true } },
      assignments: {
        include: {
          worker: { select: { id: true, name: true, color: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { requestDate: "desc" }],
  });
  return Response.json(productions);
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const assignments: AssignmentInput[] = data.assignments || [];

  const production = await prisma.production.create({
    data: {
      productId: data.productId,
      quantity: Number(data.quantity),
      requestDate: new Date(data.requestDate),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      status: data.status || "requested",
      note: data.note || null,
      assignments: {
        create: assignments.map((a) => ({
          workerId: a.workerId,
          step: a.step || null,
          quantity: Number(a.quantity),
          note: a.note || null,
        })),
      },
    },
    include: { assignments: true },
  });
  return Response.json(production);
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  const before = await prisma.production.findUnique({ where: { id } });
  if (!before) return Response.json({ error: "Not found" }, { status: 404 });

  const production = await prisma.production.update({
    where: { id },
    data: {
      ...(rest.productId && { productId: rest.productId }),
      ...(rest.quantity !== undefined && { quantity: Number(rest.quantity) }),
      ...(rest.requestDate && { requestDate: new Date(rest.requestDate) }),
      ...(rest.dueDate !== undefined && { dueDate: rest.dueDate ? new Date(rest.dueDate) : null }),
      ...(rest.status && { status: rest.status }),
      ...(rest.cutDate !== undefined && { cutDate: rest.cutDate ? new Date(rest.cutDate) : null }),
      ...(rest.materialDate !== undefined && { materialDate: rest.materialDate ? new Date(rest.materialDate) : null }),
      ...(rest.note !== undefined && { note: rest.note || null }),
    },
  });

  return Response.json(production);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  // 納品済みのAssignmentがあれば在庫から戻す
  const assignments = await prisma.productionAssignment.findMany({
    where: { productionId: id, status: "delivered" },
  });
  const production = await prisma.production.findUnique({ where: { id } });
  if (production) {
    const totalDelivered = assignments.reduce((s, a) => s + a.deliveredQty, 0);
    if (totalDelivered > 0) {
      const inv = await prisma.inventory.findUnique({ where: { productId: production.productId } });
      if (inv) {
        await prisma.inventory.update({
          where: { productId: production.productId },
          data: { stock: inv.stock - totalDelivered },
        });
      }
    }
  }
  await prisma.production.delete({ where: { id } });
  return Response.json({ ok: true });
}
