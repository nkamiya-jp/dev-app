import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/products/reorder
// 2モード:
//   ↑↓ボタン:  { id, direction: "up"|"down", withinSeries? }
//   ドラッグ:   { id, targetId, withinSeries? }  ← id を targetId の位置へ移動
export async function POST(request: NextRequest) {
  const { id, direction, targetId, withinSeries } = await request.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const current = await prisma.product.findUnique({ where: { id } });
  if (!current) return Response.json({ error: "not found" }, { status: 404 });

  // 対象リスト（withinSeries時は同シリーズのみ）を並び順で取得
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

  // 現在の sortOrder を覚えておき、後で「変わった行だけ」更新する
  const oldOrder = new Map(all.map((p) => [p.id, p.sortOrder]));

  // 移動後の並び（id配列）を組み立てる
  const ids = all.map((p) => p.id);

  if (targetId) {
    // ドラッグ: id を配列から外し、targetId の位置へ挿入
    const tIdx = ids.findIndex((x) => x === targetId);
    if (tIdx === -1) return Response.json({ error: "target not found" }, { status: 404 });
    ids.splice(idx, 1);
    const newTargetIdx = ids.findIndex((x) => x === targetId);
    // targetId の手前に挿入（下方向へ動かす時も自然になるよう調整）
    const insertAt = idx < tIdx ? newTargetIdx + 1 : newTargetIdx;
    ids.splice(insertAt, 0, id);
  } else if (direction === "up" || direction === "down") {
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) {
      return Response.json({ ok: true, noop: true });
    }
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
  } else {
    return Response.json({ error: "invalid params" }, { status: 400 });
  }

  // 並び順どおりに 100刻みで sortOrder を振り直す。
  // ただし本番(Turso)では大量更新を1トランザクションに詰めると失敗するため、
  // 実際に値が変わる行だけを更新してトランザクションを最小化する。
  const updates = ids
    .map((pid, i) => ({ pid, next: (i + 1) * 100 }))
    .filter(({ pid, next }) => oldOrder.get(pid) !== next);

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map(({ pid, next }) =>
        prisma.product.update({ where: { id: pid }, data: { sortOrder: next } })
      )
    );
  }

  return Response.json({ ok: true, updated: updates.length });
}
