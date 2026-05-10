import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { getWeeksOfMonth } from "@/lib/week-utils";

export const dynamic = "force-dynamic";

// GET /api/shipping-plan?month=2026-05
// 指定月の出荷計画グリッドを返す
export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "month=YYYY-MM is required" }, { status: 400 });
  }

  const weeks = getWeeksOfMonth(month);

  // 該当月に対応予定がある or 未出荷残のあるOrderItemを取得
  const items = await prisma.orderItem.findMany({
    where: {
      order: { status: { not: "cancelled" } },
    },
    include: {
      order: { select: { id: true, orderDate: true, dueDate: true, contactId: true, contact: { select: { id: true, name: true, company: true, type: true } } } },
      product: { select: { id: true, code: true, name: true, series: true } },
    },
    orderBy: [{ order: { orderDate: "asc" } }],
  });

  // 各itemの月別計画を抽出して、対象月にplanがあるか or 残数があるか
  const rows = items
    .map((it) => {
      let monthlyPlans: Record<string, number> = {};
      let weeklyPlans: Record<string, number> = {};
      try {
        if (it.monthlyPlans) monthlyPlans = JSON.parse(it.monthlyPlans);
      } catch {}
      try {
        if (it.weeklyPlans) weeklyPlans = JSON.parse(it.weeklyPlans);
      } catch {}

      const monthlyPlan = monthlyPlans[month] || 0;
      const remain = it.quantity - it.shippedQty;
      const include = monthlyPlan > 0 || remain > 0;

      if (!include) return null;

      // 該当月の週別配分
      const weeklyForMonth: Record<string, number> = {};
      for (const w of weeks) {
        weeklyForMonth[w.monday] = weeklyPlans[w.monday] || 0;
      }

      return {
        id: it.id,
        orderId: it.order.id,
        orderDate: it.order.orderDate,
        contactId: it.order.contact?.id,
        contactName: it.order.contact?.name || "(顧客なし)",
        company: it.order.contact?.company,
        contactType: it.order.contact?.type,
        productId: it.product.id,
        productCode: it.product.code,
        productName: it.product.name,
        productSeries: it.product.series,
        totalQuantity: it.quantity,
        shippedQty: it.shippedQty,
        remainQty: remain,
        unitPrice: it.unitPrice,
        monthlyPlan,
        weeklyPlans: weeklyForMonth,
      };
    })
    .filter(Boolean);

  return Response.json({ month, weeks, items: rows });
}

// PATCH: 週別計画を更新
// body: { itemId, weeklyPlans: { "2026-05-04": 50, ... } }
export async function PATCH(request: NextRequest) {
  const data = await request.json();
  const { itemId, weeklyPlans, monthlyPlans } = data;

  const update: Record<string, unknown> = {};
  if (weeklyPlans !== undefined) {
    update.weeklyPlans = weeklyPlans ? JSON.stringify(weeklyPlans) : null;
  }
  if (monthlyPlans !== undefined) {
    update.monthlyPlans = monthlyPlans ? JSON.stringify(monthlyPlans) : null;
  }

  const item = await prisma.orderItem.update({
    where: { id: itemId },
    data: update,
  });
  return Response.json(item);
}
