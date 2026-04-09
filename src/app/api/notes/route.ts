import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");
  const dealId = request.nextUrl.searchParams.get("dealId");
  const notes = await prisma.note.findMany({
    where: {
      ...(contactId ? { contactId } : {}),
      ...(dealId ? { dealId } : {}),
    },
    include: { contact: true, deal: true },
    orderBy: { updatedAt: "desc" },
  });
  return Response.json(notes);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const note = await prisma.note.create({
    data: {
      title: body.title,
      body: body.body || "",
      crmNote: body.crmNote || null,
      contactId: body.contactId || null,
      dealId: body.dealId || null,
    },
  });
  return Response.json(note, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...data } = body;
  const note = await prisma.note.update({ where: { id }, data });
  return Response.json(note);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await prisma.note.delete({ where: { id } });
  return Response.json({ ok: true });
}
