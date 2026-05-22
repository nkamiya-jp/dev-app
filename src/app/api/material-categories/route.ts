import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET - カテゴリ一覧
export async function GET() {
  const items = await prisma.materialCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return Response.json(items);
}

// POST - カテゴリ追加
export async function POST(request: NextRequest) {
  const data = await request.json();

  // 末尾に追加（sortOrder 自動採番）
  let sortOrder = data.sortOrder;
  if (sortOrder == null) {
    const last = await prisma.materialCategory.findFirst({
      orderBy: { sortOrder: "desc" },
      where: { sortOrder: { lt: 99 } }, // 「その他」は最後固定
    });
    sortOrder = (last?.sortOrder ?? 0) + 1;
  }

  const item = await prisma.materialCategory.create({
    data: {
      name: data.name,
      color: data.color || "bg-gray-100 text-gray-700",
      unitType: data.unitType || "piece",
      sortOrder,
      active: data.active ?? true,
    },
  });
  return Response.json(item);
}

// PUT - カテゴリ更新
export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, oldName, ...rest } = data;

  const item = await prisma.materialCategory.update({
    where: { id },
    data: {
      ...(rest.name !== undefined && { name: rest.name }),
      ...(rest.color !== undefined && { color: rest.color }),
      ...(rest.unitType !== undefined && { unitType: rest.unitType }),
      ...(rest.sortOrder !== undefined && { sortOrder: rest.sortOrder }),
      ...(rest.active !== undefined && { active: rest.active }),
    },
  });

  // 名前が変更されたら、紐付く Material も追従
  if (oldName && rest.name && oldName !== rest.name) {
    await prisma.material.updateMany({
      where: { category: oldName },
      data: { category: rest.name },
    });
  }

  return Response.json(item);
}

// DELETE - カテゴリ削除（紐付き資材は「その他」へ移動）
export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  const cat = await prisma.materialCategory.findUnique({ where: { id } });
  if (!cat) return Response.json({ error: "Not found" }, { status: 404 });

  // 紐付く資材を「その他」へ
  await prisma.material.updateMany({
    where: { category: cat.name },
    data: { category: "その他" },
  });
  await prisma.materialCategory.delete({ where: { id } });
  return Response.json({ ok: true });
}
