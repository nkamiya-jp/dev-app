import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const developments = await prisma.development.findMany({
    where,
    include: {
      product: { select: { id: true, code: true, name: true } },
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
    },
  });
  return Response.json(dev);
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  const dev = await prisma.development.update({
    where: { id },
    data: {
      ...(rest.title !== undefined && { title: rest.title }),
      ...(rest.description !== undefined && { description: rest.description || null }),
      ...(rest.status && { status: rest.status }),
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
