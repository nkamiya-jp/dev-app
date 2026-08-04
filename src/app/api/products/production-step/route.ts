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
  // 同名工程は本来1件だが、旧データで重複しているとその分だけ制作費が
  // 二重計上され「制作費が倍」になる。ここで重複を畳んで自己修復する。
  const matches = await prisma.productCostStep.findMany({
    where: { productId, step, category: "制作費" },
    orderBy: { id: "asc" },
  });
  const [keep, ...extras] = matches;
  if (extras.length > 0) {
    await prisma.productCostStep.deleteMany({ where: { id: { in: extras.map((e) => e.id) } } });
  }
  const v = value === null || value === "" || value === undefined ? 0 : Math.round(Number(value));

  if (!v) {
    if (keep) await prisma.productCostStep.delete({ where: { id: keep.id } });
    return Response.json({ ok: true, value: 0, removedDupes: extras.length });
  }
  if (keep) {
    await prisma.productCostStep.update({ where: { id: keep.id }, data: { unitCost: v } });
  } else {
    await prisma.productCostStep.create({
      data: { productId, step, unitCost: v, quantity: 1, category: "制作費" },
    });
  }
  return Response.json({ ok: true, value: v, removedDupes: extras.length });
}
