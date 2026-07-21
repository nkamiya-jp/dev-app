import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") || "";
  const category = request.nextUrl.searchParams.get("category") || "";
  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";

  const where: Record<string, unknown> = {};
  if (!includeInactive) where.active = true;
  if (category) where.category = category;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { code: { contains: search } },
    ];
  }

  const items = await prisma.material.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { productMaterials: true } } },
  });
  return Response.json(items);
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const item = await prisma.material.create({
    data: {
      code: data.code || null,
      name: data.name,
      category: data.category || "other",
      unitPrice: Number(data.unitPrice) || 0,
      unitType: data.unitType || "piece",
      fabricWidth: data.fabricWidth ? Number(data.fabricWidth) : null,
      fabricLength: data.fabricLength ? Number(data.fabricLength) : null,
      active: data.active ?? true,
      note: data.note || null,
    },
  });
  return Response.json(item);
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  const item = await prisma.material.update({
    where: { id },
    data: {
      ...(rest.code !== undefined && { code: rest.code || null }),
      ...(rest.name !== undefined && { name: rest.name }),
      ...(rest.category !== undefined && { category: rest.category }),
      ...(rest.unitPrice !== undefined && { unitPrice: Number(rest.unitPrice) || 0 }),
      ...(rest.unitType !== undefined && { unitType: rest.unitType }),
      ...(rest.fabricWidth !== undefined && { fabricWidth: rest.fabricWidth ? Number(rest.fabricWidth) : null }),
      ...(rest.fabricLength !== undefined && { fabricLength: rest.fabricLength ? Number(rest.fabricLength) : null }),
      ...(rest.active !== undefined && { active: rest.active }),
      ...(rest.note !== undefined && { note: rest.note || null }),
    },
  });
  return Response.json(item);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  // 物理削除ではなく非アクティブ化（紐付き商品があるため）
  await prisma.material.update({ where: { id }, data: { active: false } });
  return Response.json({ ok: true });
}
