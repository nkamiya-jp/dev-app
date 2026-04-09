import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const members = await prisma.member.findMany({
    orderBy: { name: "asc" },
  });
  return Response.json(members);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const member = await prisma.member.create({ data: body });
  return Response.json(member, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...data } = body;
  const member = await prisma.member.update({ where: { id }, data });
  return Response.json(member);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await prisma.member.delete({ where: { id } });
  return Response.json({ ok: true });
}
