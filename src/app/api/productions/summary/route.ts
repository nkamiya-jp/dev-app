import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/productions/summary?month=YYYY-MM
// 商品ごとに「必要納品数（その月）」と「製造数」を突き合わせ、達成状況を返す。
// - month 指定あり: required = その月の月別対応数(monthlyPlans[month]) 合計
// - month 指定なし: required = 受注数合計（キャンセル以外、全期間）
// - requested : 製造依頼数合計（Production.quantity）
// - completed : 完成数合計（ProductionAssignment.deliveredQty）
// - remaining : 不足数 = max(0, required - completed)
// - rate      : 達成率 = completed / required
export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month"); // YYYY-MM（任意）
  const useMonth = !!(month && /^\d{4}-\d{2}$/.test(month));

  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ series: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, shortName: true, series: true },
  });

  const orderItems = await prisma.orderItem.findMany({
    where: { order: { status: { not: "cancelled" } } },
    select: { productId: true, quantity: true, shippedQty: true, monthlyPlans: true },
  });

  const productions = await prisma.production.findMany({
    select: {
      productId: true,
      quantity: true,
      assignments: { select: { deliveredQty: true } },
    },
  });

  const ordered = new Map<string, number>();
  const shipped = new Map<string, number>();
  for (const it of orderItems) {
    let need = it.quantity; // month未指定は受注数
    if (useMonth) {
      need = 0;
      try {
        if (it.monthlyPlans) {
          const plans = JSON.parse(it.monthlyPlans) as Record<string, number>;
          need = Number(plans[month!]) || 0;
        }
      } catch {}
    }
    ordered.set(it.productId, (ordered.get(it.productId) ?? 0) + need);
    shipped.set(it.productId, (shipped.get(it.productId) ?? 0) + it.shippedQty);
  }

  const requested = new Map<string, number>();
  const completed = new Map<string, number>();
  for (const p of productions) {
    requested.set(p.productId, (requested.get(p.productId) ?? 0) + p.quantity);
    const done = p.assignments.reduce((s, a) => s + a.deliveredQty, 0);
    completed.set(p.productId, (completed.get(p.productId) ?? 0) + done);
  }

  const rows = products
    .map((p) => {
      const o = ordered.get(p.id) ?? 0;
      const req = requested.get(p.id) ?? 0;
      const comp = completed.get(p.id) ?? 0;
      const ship = shipped.get(p.id) ?? 0;
      const remaining = Math.max(0, o - comp);
      const rate = o > 0 ? comp / o : comp > 0 ? 1 : 0;
      return {
        productId: p.id,
        code: p.code,
        name: p.name,
        shortName: p.shortName,
        series: p.series,
        ordered: o,
        shipped: ship,
        requested: req,
        completed: comp,
        remaining,
        rate,
        achieved: o > 0 && comp >= o,
      };
    })
    // 受注か製造のどちらかがある商品のみ
    .filter((r) => r.ordered > 0 || r.requested > 0 || r.completed > 0);

  // 集計
  const totals = rows.reduce(
    (t, r) => ({
      ordered: t.ordered + r.ordered,
      requested: t.requested + r.requested,
      completed: t.completed + r.completed,
      remaining: t.remaining + r.remaining,
    }),
    { ordered: 0, requested: 0, completed: 0, remaining: 0 }
  );

  return Response.json({ rows, totals });
}
