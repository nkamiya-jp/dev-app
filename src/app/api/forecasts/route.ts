import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET: 期間内の全商品の需要データを集計して返す
// クエリ: ?from=2026-05&to=2026-10
// レスポンス: 商品ごとに月別の確定/予測/合計を返す
export async function GET(request: NextRequest) {
  const fromMonth = request.nextUrl.searchParams.get("from");
  const toMonth = request.nextUrl.searchParams.get("to");
  if (!fromMonth || !toMonth) {
    return Response.json({ error: "from and to required" }, { status: 400 });
  }

  // 月リスト生成
  const months = generateMonths(fromMonth, toMonth);

  const [products, forecasts, orderItems] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ series: "asc" }, { code: "asc" }],
    }),
    prisma.productForecast.findMany({
      where: { month: { in: months } },
    }),
    // 確定受注（status != 'cancelled'）
    prisma.orderItem.findMany({
      where: { order: { status: { not: "cancelled" } } },
      include: { order: { select: { dueDate: true, orderDate: true, status: true } } },
    }),
  ]);

  // 予測マップ
  const forecastMap = new Map<string, number>();
  for (const f of forecasts) {
    forecastMap.set(`${f.productId}:${f.month}`, f.forecast);
  }

  // 確定受注マップ（productId:month → quantity合計）
  const confirmedMap = new Map<string, number>();
  for (const it of orderItems) {
    let assignedToMonth = false;

    // monthlyPlans があればそれを優先
    if (it.monthlyPlans) {
      try {
        const plans = JSON.parse(it.monthlyPlans) as Record<string, number>;
        for (const [m, qty] of Object.entries(plans)) {
          if (months.includes(m)) {
            const key = `${it.productId}:${m}`;
            confirmedMap.set(key, (confirmedMap.get(key) || 0) + Number(qty));
            assignedToMonth = true;
          }
        }
      } catch {
        // ignore
      }
    }

    // monthlyPlans がない場合は order.dueDate (or orderDate) の月で集計
    if (!assignedToMonth) {
      const ref = it.order.dueDate || it.order.orderDate;
      if (ref) {
        const m = ymToString(new Date(ref));
        if (months.includes(m)) {
          const key = `${it.productId}:${m}`;
          // 残数（未出荷分）で計上
          const remain = it.quantity - it.shippedQty;
          if (remain > 0) {
            confirmedMap.set(key, (confirmedMap.get(key) || 0) + remain);
          }
        }
      }
    }
  }

  const data = products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    series: p.series,
    months: months.map((m) => ({
      month: m,
      confirmed: confirmedMap.get(`${p.id}:${m}`) || 0,
      forecast: forecastMap.get(`${p.id}:${m}`) || 0,
    })),
  }));

  return Response.json({ months, products: data });
}

// POST: 予測値を保存（upsert）
// body: { productId, month, forecast, source?, note? }
export async function POST(request: NextRequest) {
  const data = await request.json();
  const result = await prisma.productForecast.upsert({
    where: {
      productId_month: { productId: data.productId, month: data.month },
    },
    create: {
      productId: data.productId,
      month: data.month,
      forecast: Number(data.forecast),
      source: data.source || "manual",
      note: data.note || null,
    },
    update: {
      forecast: Number(data.forecast),
      source: data.source || "manual",
      note: data.note ?? undefined,
    },
  });
  return Response.json(result);
}

function ymToString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function generateMonths(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const result: string[] = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { y++; m = 1; }
  }
  return result;
}
