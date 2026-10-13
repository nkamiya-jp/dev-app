import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { isDevPhase } from "@/lib/development-phase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const developments = await prisma.development.findMany({
    where,
    include: {
      product: { select: { id: true, code: true, name: true } },
      contact: { select: { id: true, name: true, company: true } },
      _count: { select: { orders: true } },
      tasks: { select: { id: true, status: true } },
      milestones: { orderBy: { date: "asc" } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return Response.json(developments);
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const dev = await prisma.development.create({
    data: {
      title: data.title,
      description: data.description || null,
      status: data.status || "active",
      initiator: data.initiator || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      releasedDate: data.releasedDate ? new Date(data.releasedDate) : null,
      productId: data.productId || null,
      notes: data.notes || null,
      ...(isDevPhase(data.phase) && { phase: data.phase }),
      contactId: data.contactId || null,
    },
  });
  return Response.json(dev);
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  if (rest.phase !== undefined && !isDevPhase(rest.phase)) {
    return Response.json({ error: "invalid phase" }, { status: 400 });
  }

  // 段階と状態の連動：納品完了にしたら「完了」、納品完了から戻したら「進行中」
  let status: string | undefined = rest.status;
  if (rest.phase !== undefined && !status) {
    const cur = await prisma.development.findUnique({ where: { id }, select: { status: true } });
    if (rest.phase === "delivered" && cur?.status === "active") status = "released";
    if (rest.phase !== "delivered" && cur?.status === "released") status = "active";
  }

  const dev = await prisma.development.update({
    where: { id },
    data: {
      ...(rest.title !== undefined && { title: rest.title }),
      ...(rest.phase !== undefined && { phase: rest.phase }),
      ...(rest.contactId !== undefined && { contactId: rest.contactId || null }),
      ...(rest.description !== undefined && { description: rest.description || null }),
      ...(status && { status }),
      ...(rest.initiator !== undefined && { initiator: rest.initiator || null }),
      ...(rest.startDate !== undefined && { startDate: rest.startDate ? new Date(rest.startDate) : null }),
      ...(rest.releasedDate !== undefined && { releasedDate: rest.releasedDate ? new Date(rest.releasedDate) : null }),
      ...(rest.productId !== undefined && { productId: rest.productId || null }),
      ...(rest.notes !== undefined && { notes: rest.notes || null }),
    },
  });
  return Response.json(dev);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.development.delete({ where: { id } });
  return Response.json({ ok: true });
}
