import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// PUT /api/orders/items/reorder - 受注内の明細の並び順を保存
// body: { orderId, ids: [明細id（上から順）] }
// Turso で大きなトランザクションは落ちるので、並び順が変わる行だけを1件ずつ更新する
export async function PUT(request: NextRequest) {
  const { orderId, ids } = (await request.json()) as { orderId?: string; ids?: string[] };
  if (!orderId || !Array.isArray(ids)) {
    return Response.json({ error: "orderId and ids required" }, { status: 400 });
  }
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { id: true, sortOrder: true },
  });
  const current = new Map(items.map((it) => [it.id, it.sortOrder]));
  if (ids.length !== items.length || ids.some((id) => !current.has(id))) {
    return Response.json({ error: "明細が変わっています。画面を読み込み直してください" }, { status: 409 });
  }
  let updated = 0;
  for (const [i, id] of ids.entries()) {
    if (current.get(id) === i) continue;
    await prisma.orderItem.update({ where: { id }, data: { sortOrder: i } });
    updated++;
  }
  return Response.json({ ok: true, updated });
}
