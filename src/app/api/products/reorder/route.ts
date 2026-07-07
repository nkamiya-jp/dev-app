import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/products/reorder
// body: { id, direction: "up" | "down", withinSeries?: boolean }
// 指定商品を、上/下の商品と sortOrder を入れ替える
// withinSeries=true のときは同じシリーズ内で入れ替え（商品マスタ用）
export async function POST(request: NextRequest) {
  const { id, direction, withinSeries } = await request.json();
  if (!id || (direction !== "up" && direction !== "down")) {
    return Response.json({ error: "invalid params" }, { status: 400 });
  }

  const current = await prisma.product.findUnique({ where: { id } });
  if (!current) return Response.json({ error: "not found" }, { status: 404 });

  // アクティブ商品を並び順で取得（withinSeries時は同シリーズのみ）
  const all = await prisma.product.findMany({
    where: withinSeries
      ? { active: true, series: current.series }
      : { active: true },
    orderBy: withinSeries
      ? [{ sortOrder: "asc" }, { code: "asc" }]
      : [{ sortOrder: "asc" }, { series: "asc" }, { code: "asc" }],
    select: { id: true, sortOrder: true },
  });

  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return Response.json({ error: "not in list" }, { status: 404 });

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) {
    return Response.json({ ok: true, noop: true }); // 端なので何もしない
  }

  const a = all[idx];
  const b = all[swapIdx];

  // sortOrder を入れ替え（同値の場合は idx ベースで振り直す）
  let aOrder = a.sortOrder;
  let bOrder = b.sortOrder;
  if (aOrder === bOrder) {
    aOrder = (idx + 1) * 100;
    bOrder = (swapIdx + 1) * 100;
  }

  await prisma.$transaction([
    prisma.product.update({ where: { id: a.id }, data: { sortOrder: bOrder } }),
    prisma.product.update({ where: { id: b.id }, data: { sortOrder: aOrder } }),
  ]);

  return Response.json({ ok: true });
}
