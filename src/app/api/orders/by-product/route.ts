import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { getWeeksOfMonth } from "@/lib/week-utils";

export const dynamic = "force-dynamic";

// "YYYY-MM" を n ヶ月ずらす
function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  let yy = y;
  let mm = m + n;
  while (mm > 12) { mm -= 12; yy += 1; }
  while (mm < 1) { mm += 12; yy -= 1; }
  return `${yy}-${String(mm).padStart(2, "0")}`;
}

// GET /api/orders/by-product?month=YYYY-MM[&productId=X]
// 全商品（またはproductId指定時はその商品のみ）の受注を「出荷管理表」形式で
// 商品ごとのグループにして返す。1行=1受注明細。
export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get("productId");
  const month = request.nextUrl.searchParams.get("month");

  // 商品一覧
  const products = await prisma.product.findMany({
    where: { active: true, ...(productId ? { id: productId } : {}) },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, series: true },
  });

  const weeks = month && /^\d{4}-\d{2}$/.test(month) ? getWeeksOfMonth(month) : [];

  // 月別対応列は「選択月の前月・当月・翌月」を固定表示（見本の 6/7/8月 に相当）
  const baseMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : null;
  const months = baseMonth ? [shiftMonth(baseMonth, -1), baseMonth, shiftMonth(baseMonth, 1)] : [];

  const productIds = products.map((p) => p.id);

  // 対象商品の受注明細（キャンセル以外）をまとめて取得
  const items = await prisma.orderItem.findMany({
    where: { productId: { in: productIds }, order: { status: { not: "cancelled" } } },
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

  // 在庫（現在）
  const inventories = await prisma.inventory.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true, stock: true },
  });
  const stockMap = new Map(inventories.map((i) => [i.productId, i.stock]));

  // 製造入荷予定（未納品・非仮制作の残数を対象月ごとに集計）
  const prods = await prisma.production.findMany({
    where: {
      productId: { in: productIds },
      provisional: false,
      status: { not: "delivered" },
      ...(months.length ? { targetMonth: { in: months } } : {}),
    },
    select: {
      productId: true,
      quantity: true,
      targetMonth: true,
      assignments: { select: { deliveredQty: true } },
    },
  });
  // prodInByProduct[productId][month] = 入荷予定数
  const prodInByProduct = new Map<string, Record<string, number>>();
  for (const p of prods) {
    if (!p.targetMonth) continue;
    const delivered = p.assignments.reduce((s, a) => s + a.deliveredQty, 0);
    const remain = Math.max(0, p.quantity - delivered);
    if (remain <= 0) continue;
    const rec = prodInByProduct.get(p.productId) ?? {};
    rec[p.targetMonth] = (rec[p.targetMonth] ?? 0) + remain;
    prodInByProduct.set(p.productId, rec);
  }

  // 出荷実績を (productId, orderId) 単位で集める
  const shipments = await prisma.shipment.findMany({
    where: { productId: { in: productIds } },
    orderBy: { shipDate: "asc" },
    select: { productId: true, orderId: true, shipDate: true, quantity: true },
  });
  const shipByKey = new Map<string, { shipDate: Date; quantity: number }[]>();
  for (const s of shipments) {
    if (!s.orderId || !s.productId) continue;
    const key = `${s.productId}::${s.orderId}`;
    if (!shipByKey.has(key)) shipByKey.set(key, []);
    shipByKey.get(key)!.push({ shipDate: s.shipDate, quantity: s.quantity });
  }

  function buildRow(it: (typeof items)[number], pid: string) {
    let monthlyPlans: Record<string, number> = {};
    let weeklyPlans: Record<string, number> = {};
    try { if (it.monthlyPlans) monthlyPlans = JSON.parse(it.monthlyPlans); } catch {}
    try { if (it.weeklyPlans) weeklyPlans = JSON.parse(it.weeklyPlans); } catch {}
    const ships = shipByKey.get(`${pid}::${it.order.id}`) ?? [];
    const shipStr = ships
      .map((s) => {
        const d = new Date(s.shipDate);
        return `${d.getMonth() + 1}/${d.getDate()} ${s.quantity}`;
      })
      .join("  ");
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
  }

  // 商品ごとに明細をまとめる
  const itemsByProduct = new Map<string, typeof items>();
  for (const it of items) {
    if (!it.productId) continue;
    if (!itemsByProduct.has(it.productId)) itemsByProduct.set(it.productId, []);
    itemsByProduct.get(it.productId)!.push(it);
  }

  const groups = products.map((p) => {
    const its = itemsByProduct.get(p.id) ?? [];
    const rows = its.map((it) => buildRow(it, p.id));
    const openQty = rows.reduce((s, r) => s + Math.max(0, r.remainQty), 0);
    const prodByMonth: Record<string, number> = {};
    const rec = prodInByProduct.get(p.id) ?? {};
    for (const m of months) prodByMonth[m] = rec[m] ?? 0;
    return {
      productId: p.id,
      code: p.code,
      name: p.name,
      series: p.series,
      orderCount: rows.length,
      openQty, // 未出荷合計（アクティブ判定用）
      stock: stockMap.get(p.id) ?? 0,
      prodByMonth, // 対象3ヶ月の製造入荷予定
      rows,
    };
  });

  return Response.json({ products, productId, months, weeks, groups });
}

// PATCH /api/orders/by-product  { itemId, monthlyPlans?, weeklyPlans? }
// 月別対応数・週別対応数を保存（部分更新: 送られたキーだけ既存にマージ）
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !body.itemId) {
    return Response.json({ error: "itemId required" }, { status: 400 });
  }
  const item = await prisma.orderItem.findUnique({
    where: { id: body.itemId },
    select: { monthlyPlans: true, weeklyPlans: true },
  });
  if (!item) return Response.json({ error: "not found" }, { status: 404 });

  const data: { monthlyPlans?: string; weeklyPlans?: string } = {};

  if (body.monthlyPlans && typeof body.monthlyPlans === "object") {
    let cur: Record<string, number> = {};
    try { if (item.monthlyPlans) cur = JSON.parse(item.monthlyPlans); } catch {}
    for (const [k, v] of Object.entries(body.monthlyPlans)) {
      const n = Number(v);
      if (!n || n <= 0) delete cur[k];
      else cur[k] = n;
    }
    data.monthlyPlans = JSON.stringify(cur);
  }

  if (body.weeklyPlans && typeof body.weeklyPlans === "object") {
    let cur: Record<string, number> = {};
    try { if (item.weeklyPlans) cur = JSON.parse(item.weeklyPlans); } catch {}
    for (const [k, v] of Object.entries(body.weeklyPlans)) {
      const n = Number(v);
      if (!n || n <= 0) delete cur[k];
      else cur[k] = n;
    }
    data.weeklyPlans = JSON.stringify(cur);
  }

  await prisma.orderItem.update({ where: { id: body.itemId }, data });
  return Response.json({ ok: true });
}
