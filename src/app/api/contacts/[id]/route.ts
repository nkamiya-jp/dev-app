import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      deals: { orderBy: { updatedAt: "desc" } },
      tasks: { orderBy: { dueDate: "asc" } },
    },
  });
  if (!contact) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(contact);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const contact = await prisma.contact.update({ where: { id }, data: body });
  return Response.json(contact);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.contact.delete({ where: { id } });
  return Response.json({ ok: true });
}
