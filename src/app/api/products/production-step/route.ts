import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/products/production-step
// body: { productId, step: "口金"|"貼り"|"縫製"|"その他", value: number|null }
// 制作費の固定工程を名前でupsert。value が 0/null なら該当工程を削除。
// 一覧からの直接入力用（工程IDを知らなくても単価を設定できる）。
export async function POST(request: NextRequest) {
  const { productId, step, value } = await request.json();
  if (!productId || !step) {
    return Response.json({ error: "productId and step required" }, { status: 400 });
  }
  const existing = await prisma.productCostStep.findFirst({
    where: { productId, step, category: "制作費" },
  });
  const v = value === null || value === "" || value === undefined ? 0 : Math.round(Number(value));

  if (!v) {
    if (existing) await prisma.productCostStep.delete({ where: { id: existing.id } });
    return Response.json({ ok: true, value: 0 });
  }
  if (existing) {
    await prisma.productCostStep.update({ where: { id: existing.id }, data: { unitCost: v } });
  } else {
    await prisma.productCostStep.create({
      data: { productId, step, unitCost: v, quantity: 1, category: "制作費" },
    });
  }
  return Response.json({ ok: true, value: v });
}
