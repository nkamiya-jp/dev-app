import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") || "";
  const series = request.nextUrl.searchParams.get("series") || "";
  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";

  const where: Record<string, unknown> = {};
  if (!includeInactive) where.active = true;
  if (series) where.series = series;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { code: { contains: search } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ series: "asc" }, { code: "asc" }],
    include: { inventory: true },
  });
  return Response.json(products);
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const product = await prisma.product.create({
    data: {
      code: data.code,
      name: data.name,
      series: data.series || null,
      size: data.size || null,
      wholesalePrice: data.wholesalePrice ?? null,
      workerCost: data.workerCost ?? null,
      description: data.description || null,
      active: data.active ?? true,
    },
  });
  return Response.json(product);
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(rest.code !== undefined && { code: rest.code }),
      ...(rest.name !== undefined && { name: rest.name }),
      ...(rest.series !== undefined && { series: rest.series || null }),
      ...(rest.size !== undefined && { size: rest.size || null }),
      ...(rest.wholesalePrice !== undefined && { wholesalePrice: rest.wholesalePrice }),
      ...(rest.workerCost !== undefined && { workerCost: rest.workerCost }),
      ...(rest.description !== undefined && { description: rest.description || null }),
      ...(rest.active !== undefined && { active: rest.active }),
    },
  });
  return Response.json(product);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  // 物理削除ではなく非アクティブ化
  await prisma.product.update({ where: { id }, data: { active: false } });
  return Response.json({ ok: true });
}
