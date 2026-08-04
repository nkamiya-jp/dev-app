import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// 制作費の固定工程（名前で一意）。ここに含まれる工程は重複させない。
const FIXED_PRODUCTION_STEPS = ["口金", "貼り", "縫製", "その他"];

// POST - 工程追加
export async function POST(request: NextRequest) {
  const data = await request.json();
  const category = data.category || "制作費";

  // 制作費の固定工程は名前でupsert（既存があれば更新し、重複していれば畳む）。
  // クライアント状態が古いままPOSTされても二重登録されないようにする根本対策。
  if (category === "制作費" && FIXED_PRODUCTION_STEPS.includes(data.step)) {
    const matches = await prisma.productCostStep.findMany({
      where: { productId: data.productId, category: "制作費", step: data.step },
      orderBy: { id: "asc" },
    });
    const [keep, ...extras] = matches;
    if (extras.length > 0) {
      await prisma.productCostStep.deleteMany({ where: { id: { in: extras.map((e) => e.id) } } });
    }
    if (keep) {
      const updated = await prisma.productCostStep.update({
        where: { id: keep.id },
        data: { unitCost: Number(data.unitCost) || 0, quantity: Number(data.quantity) || 1 },
      });
      return Response.json(updated);
    }
  }

  const item = await prisma.productCostStep.create({
    data: {
      productId: data.productId,
      step: data.step,
      unitCost: Number(data.unitCost) || 0,
      quantity: Number(data.quantity) || 1,
      category,
      subType: data.subType || null,
      sortOrder: data.sortOrder ?? 0,
      note: data.note || null,
    },
  });
  return Response.json(item);
}

// PUT - 工程更新
export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  const item = await prisma.productCostStep.update({
    where: { id },
    data: {
      ...(rest.step !== undefined && { step: rest.step }),
      ...(rest.unitCost !== undefined && { unitCost: Number(rest.unitCost) || 0 }),
      ...(rest.quantity !== undefined && { quantity: Number(rest.quantity) || 1 }),
      ...(rest.category !== undefined && { category: rest.category }),
      ...(rest.subType !== undefined && { subType: rest.subType || null }),
      ...(rest.sortOrder !== undefined && { sortOrder: rest.sortOrder }),
      ...(rest.note !== undefined && { note: rest.note || null }),
    },
  });
  return Response.json(item);
}

// DELETE
export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.productCostStep.delete({ where: { id } });
  return Response.json({ ok: true });
}
