import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { getWeeksOfMonth } from "@/lib/week-utils";

export const dynamic = "force-dynamic";

// GET /api/orders/by-product?productId=X&month=YYYY-MM
// 指定商品の受注を「出荷管理表」形式で返す（1行=1受注明細）
export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get("productId");
  const month = request.nextUrl.searchParams.get("month"); // 週バケツ表示月（任意）

  // 商品一覧（セレクタ用）
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ series: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, series: true },
  });

  if (!productId) {
    return Response.json({ products, months: [], weeks: [], rows: [], productId: null });
  }

  const weeks = month && /^\d{4}-\d{2}$/.test(month) ? getWeeksOfMonth(month) : [];

  // 該当商品の受注明細（キャンセル以外）
  const items = await prisma.orderItem.findMany({
    where: { productId, order: { status: { not: "cancelled" } } },
    include: {
      order: {
        select: {
          id: true, orderDate: true, dueDate: true, status: true,
          contact: { select: { id: true, name: true, company: true, type: true } },
        },
      },
    },
    orderBy: [{ order: { orderDate: "asc" } }],
  });

  // 出荷実績（この商品）を order 単位で集める
  const shipments = await prisma.shipment.findMany({
    where: { productId },
    orderBy: { shipDate: "asc" },
    select: { orderId: true, shipDate: true, quantity: true },
  });
  const shipByOrder = new Map<string, { shipDate: Date; quantity: number }[]>();
  for (const s of shipments) {
    if (!s.orderId) continue;
    if (!shipByOrder.has(s.orderId)) shipByOrder.set(s.orderId, []);
    shipByOrder.get(s.orderId)!.push({ shipDate: s.shipDate, quantity: s.quantity });
  }

  const monthsSet = new Set<string>();

  const rows = items.map((it) => {
    let monthlyPlans: Record<string, number> = {};
    let weeklyPlans: Record<string, number> = {};
    try { if (it.monthlyPlans) monthlyPlans = JSON.parse(it.monthlyPlans); } catch {}
    try { if (it.weeklyPlans) weeklyPlans = JSON.parse(it.weeklyPlans); } catch {}
    for (const k of Object.keys(monthlyPlans)) if (monthlyPlans[k]) monthsSet.add(k);

    // 出荷日(個数) 文字列（"6/25 200 7/3 100"）
    const ships = shipByOrder.get(it.order.id) ?? [];
    const shipStr = ships
      .map((s) => {
        const d = new Date(s.shipDate);
        return `${d.getMonth() + 1}/${d.getDate()} ${s.quantity}`;
      })
      .join("  ");

    // 週バケツ（表示月の各週）
    const weeklyForMonth: Record<string, number> = {};
    for (const w of weeks) weeklyForMonth[w.monday] = weeklyPlans[w.monday] || 0;

    return {
      itemId: it.id,
      orderId: it.order.id,
      orderDate: it.order.orderDate,
      status: it.order.status,
      contactId: it.order.contact?.id ?? null,
      contactName: it.order.contact?.name ?? "(顧客なし)",
      company: it.order.contact?.company ?? null,
      quantity: it.quantity,
      shippedQty: it.shippedQty,
      remainQty: it.quantity - it.shippedQty,
      monthlyPlans,
      shipStr,
      weeklyPlans: weeklyForMonth,
    };
  });

  const months = [...monthsSet].sort();

  return Response.json({ products, productId, months, weeks, rows });
}
