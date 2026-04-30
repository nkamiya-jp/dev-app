import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type"); // staff | worker | (省略=全件)
  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (!includeInactive) where.active = true;

  const members = await prisma.member.findMany({
    where,
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return Response.json(members);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const member = await prisma.member.create({
    data: {
      name: body.name,
      role: body.role || null,
      color: body.color || "#3b82f6",
      type: body.type || "staff",
      phone: body.phone || null,
      specialties: body.specialties || null,
      active: body.active ?? true,
    },
  });
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
  // 物理削除ではなく非アクティブ化
  await prisma.member.update({ where: { id }, data: { active: false } });
  return Response.json({ ok: true });
}
