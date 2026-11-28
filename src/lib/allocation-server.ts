// 分納の見える化（サーバー側専用）
// 未出荷の受注明細に、今の在庫 → 製造中（未納品の割当）の順で数を割り当てて、
// 明細ごとに「在庫から出せる／製造中を待つ／まだ手配していない」を出す。
// 割り当て順：発送予定日が早い順（未設定は後ろ）→ 受注日が早い順 → 作成順。
// 実際の出荷・引当は記録しない（表示のための目安）。
import { prisma } from "@/lib/db";

export type ItemAlloc = {
  /** 未出荷 */
  remain: number;
  /** 今の在庫から出せる数 */
  fromStock: number;
  /** 製造中（未納品の割当）が上がれば出せる数 */
  fromProduction: number;
  /** まだ手配していない数（製造依頼が必要） */
  unplanned: number;
};

export async function allocateOpenItems(productIds?: string[]) {
  const pf = productIds ? { productId: { in: productIds } } : {};
  const [items, inventories, productions] = await Promise.all([
    prisma.orderItem.findMany({
      where: { ...pf, order: { status: { notIn: ["cancelled", "completed"] } } },
      select: {
        id: true, productId: true, quantity: true, shippedQty: true, createdAt: true,
        order: { select: { dueDate: true, orderDate: true, createdAt: true } },
      },
    }),
    prisma.inventory.findMany({ where: pf, select: { productId: true, stock: true } }),
    prisma.production.findMany({
      where: { ...pf, provisional: false },
      select: { productId: true, assignments: { select: { quantity: true, deliveredQty: true, status: true } } },
    }),
  ]);

  const stock = new Map(inventories.map((i) => [i.productId, Math.max(0, i.stock)]));
  const inFlight = new Map<string, number>();
  for (const p of productions) {
    for (const a of p.assignments) {
      if (a.status === "delivered") continue;
      inFlight.set(p.productId, (inFlight.get(p.productId) ?? 0) + Math.max(0, a.quantity - a.deliveredQty));
    }
  }

  const open = items.filter((it) => it.quantity - it.shippedQty > 0);
  const t = (d: Date | null) => (d ? d.getTime() : Number.MAX_SAFE_INTEGER);
  open.sort(
    (a, b) =>
      t(a.order.dueDate) - t(b.order.dueDate) ||
      t(a.order.orderDate) - t(b.order.orderDate) ||
      t(a.order.createdAt) - t(b.order.createdAt) ||
      t(a.createdAt) - t(b.createdAt),
  );

  const out = new Map<string, ItemAlloc>();
  for (const it of open) {
    const remain = it.quantity - it.shippedQty;
    const s = stock.get(it.productId) ?? 0;
    const fromStock = Math.min(s, remain);
    stock.set(it.productId, s - fromStock);
    const f = inFlight.get(it.productId) ?? 0;
    const fromProduction = Math.min(f, remain - fromStock);
    inFlight.set(it.productId, f - fromProduction);
    out.set(it.id, { remain, fromStock, fromProduction, unplanned: remain - fromStock - fromProduction });
  }
  return out;
}
