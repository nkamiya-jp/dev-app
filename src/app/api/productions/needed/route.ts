import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { compareProductOrder } from "@/lib/product-meta";
import { forecastRemainByProduct } from "@/lib/forecast-server";
import { todayJst } from "@/lib/roadmap/settings";

export const dynamic = "force-dynamic";

// GET /api/productions/needed
// 「納品が必要な商品」= 受注残があり、在庫＋製造中で賄いきれない商品のリスト。
// 対応者に振り分けていない（製造依頼がない）商品も含めて返す。
// - orderRemain : 受注残（未出荷）= Σ(quantity - shippedQty) キャンセル以外
// - stock       : 在庫
// - inFlight    : 製造中（未納品の割当数合計）
// - forecastRemain : 今月の予想のうち、まだ注文になっていない数（顧客×商品ごとに 予想−今月の受注 の残り）
// - toMake      : 作るべき数 = max(0, orderRemain + forecastRemain - stock - inFlight)
// 予想は注文の先取り（在庫は溜めない運用）なので、今月分だけを足す
export async function GET(_request: NextRequest) {
  const products = (await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, shortName: true, series: true, sortOrder: true },
  })).sort(compareProductOrder);

  const orderItems = await prisma.orderItem.findMany({
    where: { order: { status: { not: "cancelled" } } },
    select: { productId: true, quantity: true, shippedQty: true },
  });

  const productions = await prisma.production.findMany({
    where: { provisional: false }, // 仮制作は集計から除外
    select: {
      productId: true,
      assignments: { select: { quantity: true, deliveredQty: true, status: true } },
    },
  });

  const inventories = await prisma.inventory.findMany({ select: { productId: true, stock: true } });
  const month = todayJst().slice(0, 7);
  const forecast = await forecastRemainByProduct(month);

  const orderRemain = new Map<string, number>();
  for (const it of orderItems) {
    orderRemain.set(it.productId, (orderRemain.get(it.productId) ?? 0) + Math.max(0, it.quantity - it.shippedQty));
  }

  const stockMap = new Map<string, number>();
  for (const inv of inventories) stockMap.set(inv.productId, inv.stock);

  const inFlight = new Map<string, number>(); // 未納品の割当数
  const hasProd = new Set<string>();
  for (const p of productions) {
    hasProd.add(p.productId);
    for (const a of p.assignments) {
      if (a.status !== "delivered") {
        inFlight.set(p.productId, (inFlight.get(p.productId) ?? 0) + a.quantity);
      }
    }
  }

  const rows = products
    .map((p) => {
      const remain = orderRemain.get(p.id) ?? 0;
      const stock = stockMap.get(p.id) ?? 0;
      const flight = inFlight.get(p.id) ?? 0;
      const fc = forecast.get(p.id);
      const forecastRemain = fc?.remain ?? 0;
      const toMake = Math.max(0, remain + forecastRemain - stock - flight);
      return {
        productId: p.id,
        code: p.code,
        name: p.name,
        shortName: p.shortName,
        series: p.series,
        orderRemain: remain,
        forecast: fc?.forecast ?? 0,
        forecastRemain,
        stock,
        inFlight: flight,
        toMake,
        hasProduction: hasProd.has(p.id),
      };
    })
    // 受注残か今月の予想の残りがある商品のみ。作るべき数の多い順。
    .filter((r) => r.orderRemain > 0 || r.forecastRemain > 0)
    .sort((a, b) => b.toMake - a.toMake || b.orderRemain - a.orderRemain);

  const totals = rows.reduce(
    (t, r) => ({
      orderRemain: t.orderRemain + r.orderRemain,
      forecastRemain: t.forecastRemain + r.forecastRemain,
      stock: t.stock + r.stock,
      inFlight: t.inFlight + r.inFlight,
      toMake: t.toMake + r.toMake,
    }),
    { orderRemain: 0, forecastRemain: 0, stock: 0, inFlight: 0, toMake: 0 }
  );

  return Response.json({ month, rows, totals });
}
