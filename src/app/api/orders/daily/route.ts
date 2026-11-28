import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { compareProductOrder } from "@/lib/product-meta";
import { effectivePrices } from "@/lib/customer-price-server";
import { loadForecastCells } from "@/lib/forecast-server";
import { todayJst } from "@/lib/roadmap/settings";

export const dynamic = "force-dynamic";

// 毎日伺うお店（Contact.dailyOrder）の、その日の注文。1店×1日＝1つの受注（note が DAILY_NOTE）
const DAILY_NOTE = "毎日伺い";

const dayRange = (date: string) => {
  const start = new Date(`${date}T00:00:00+09:00`);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
};
const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(`${month}-01T00:00:00+09:00`), end: new Date(Date.UTC(y, m, 1) - 9 * 3600 * 1000) };
};

async function findDailyOrder(contactId: string, date: string) {
  const { start, end } = dayRange(date);
  return prisma.order.findFirst({
    where: { contactId, note: DAILY_NOTE, orderDate: { gte: start, lt: end }, status: { not: "cancelled" } },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
}

// GET /api/orders/daily — 毎日伺うお店の一覧（今日の注文の有無つき）
// GET /api/orders/daily?contactId=&date=YYYY-MM-DD — そのお店の商品ごとの 今月の予想・今月の注文・今日の数
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("date") || "") ? sp.get("date")! : todayJst();
  const contactId = sp.get("contactId");

  if (!contactId) {
    const { start, end } = dayRange(date);
    const contacts = await prisma.contact.findMany({
      where: { dailyOrder: true },
      select: { id: true, name: true, company: true, orders: { where: { note: DAILY_NOTE, orderDate: { gte: start, lt: end }, status: { not: "cancelled" } }, select: { items: { select: { quantity: true } } } } },
      orderBy: [{ company: "asc" }, { name: "asc" }],
    });
    return Response.json({
      date,
      contacts: contacts.map((c) => ({
        id: c.id,
        label: c.company || c.name,
        todayQty: c.orders.reduce((a, o) => a + o.items.reduce((b, it) => b + it.quantity, 0), 0),
      })),
    });
  }

  const month = date.slice(0, 7);
  const { start: mStart, end: mEnd } = monthRange(month);
  const since = new Date(new Date(`${date}T00:00:00+09:00`).getTime() - 90 * 24 * 3600 * 1000);
  const [contact, prices, cells, monthOrders, recentItems, todayOrder] = await Promise.all([
    prisma.contact.findUnique({ where: { id: contactId }, select: { id: true, name: true, company: true } }),
    effectivePrices(contactId),
    loadForecastCells([month], { contactId }),
    prisma.order.findMany({
      where: { contactId, status: { not: "cancelled" }, orderDate: { gte: mStart, lt: mEnd } },
      select: { id: true, items: { select: { productId: true, quantity: true } } },
    }),
    prisma.orderItem.findMany({
      where: { order: { contactId, status: { not: "cancelled" }, orderDate: { gte: since } } },
      select: { productId: true },
      distinct: ["productId"],
    }),
    findDailyOrder(contactId, date),
  ]);
  if (!contact || !prices) return Response.json({ error: "顧客が見つかりません" }, { status: 404 });

  const forecast = new Map<string, number>();
  for (const [k, c] of cells) forecast.set(k.split("|")[2], c.qty);
  const orderedOther = new Map<string, number>(); // 今月の注文（今日のこの受注を除く）
  for (const o of monthOrders) {
    if (o.id === todayOrder?.id) continue;
    for (const it of o.items) orderedOther.set(it.productId, (orderedOther.get(it.productId) ?? 0) + it.quantity);
  }
  const today = new Map<string, number>();
  for (const it of todayOrder?.items ?? []) today.set(it.productId, (today.get(it.productId) ?? 0) + it.quantity);

  // 並べる商品：取扱商品・予想がある・最近90日に注文があった・今日入っている
  const show = new Set<string>([
    ...prices.items.filter((p) => p.handled).map((p) => p.productId),
    ...forecast.keys(),
    ...recentItems.map((r) => r.productId),
    ...today.keys(),
  ]);
  const products = (await prisma.product.findMany({
    where: { active: true, OR: [{ ownerContactId: null }, { ownerContactId: contactId }] },
    select: { id: true, code: true, name: true, shortName: true, series: true, sortOrder: true },
  })).sort(compareProductOrder);
  const priceMap = new Map(prices.items.map((p) => [p.productId, p]));

  const row = (p: (typeof products)[number]) => {
    const fc = forecast.get(p.id) ?? 0;
    const other = orderedOther.get(p.id) ?? 0;
    return {
      productId: p.id, code: p.code, name: p.shortName || p.name, series: p.series,
      price: priceMap.get(p.id)?.price ?? null,
      forecast: fc,
      orderedMonth: other,
      today: today.get(p.id) ?? 0,
    };
  };
  return Response.json({
    date,
    month,
    contact: { id: contact.id, label: contact.company || contact.name },
    orderId: todayOrder?.id ?? null,
    rows: products.filter((p) => show.has(p.id)).map(row),
    others: products.filter((p) => !show.has(p.id)).map((p) => ({ productId: p.id, code: p.code, name: p.shortName || p.name })),
  });
}

// PUT /api/orders/daily { contactId, date, items: [{ productId, quantity }] }
// その日のそのお店の受注を、渡した数にそろえる（0は明細を消す。出荷済みの明細は出荷数より減らさない）
export async function PUT(request: NextRequest) {
  const b = await request.json();
  const contactId = String(b.contactId || "");
  const date = String(b.date || "");
  if (!contactId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "お店と日付を指定してください" }, { status: 400 });
  const want = new Map<string, number>();
  for (const it of Array.isArray(b.items) ? b.items : []) {
    if (!it?.productId) continue;
    want.set(String(it.productId), Math.max(0, Math.round(Number(it.quantity) || 0)));
  }

  let order = await findDailyOrder(contactId, date);
  const needsCreate = [...want].filter(([, q]) => q > 0);
  if (!order) {
    if (needsCreate.length === 0) return Response.json({ ok: true, orderId: null });
    const prices = await effectivePrices(contactId);
    if (!prices) return Response.json({ error: "顧客が見つかりません" }, { status: 404 });
    const pm = new Map(prices.items.map((p) => [p.productId, p.price]));
    const created = await prisma.order.create({
      data: {
        contactId,
        orderDate: new Date(`${date}T00:00:00+09:00`),
        note: DAILY_NOTE,
        items: { create: needsCreate.map(([productId, quantity], i) => ({ productId, quantity, unitPrice: pm.get(productId) ?? null, sortOrder: i })) },
      },
    });
    return Response.json({ ok: true, orderId: created.id });
  }

  // 既存の受注を変わった明細だけ更新する（大きなトランザクションは本番で落ちるので1件ずつ）
  let prices: Map<string, number | null> | null = null;
  let sort = order.items.reduce((a, it) => Math.max(a, it.sortOrder), -1) + 1;
  for (const [productId, qty] of want) {
    const items = order.items.filter((it) => it.productId === productId);
    const cur = items.reduce((a, it) => a + it.quantity, 0);
    if (cur === qty) continue;
    if (items.length === 0) {
      if (!prices) {
        const r = await effectivePrices(contactId);
        prices = new Map((r?.items ?? []).map((p) => [p.productId, p.price]));
      }
      await prisma.orderItem.create({ data: { orderId: order.id, productId, quantity: qty, unitPrice: prices.get(productId) ?? null, sortOrder: sort++ } });
      continue;
    }
    // 1つ目の明細に寄せる
    const [first, ...rest] = items;
    for (const it of rest) {
      if (it.shippedQty > 0) continue;
      await prisma.orderItem.delete({ where: { id: it.id } });
    }
    const restShipped = rest.reduce((a, it) => a + (it.shippedQty > 0 ? it.quantity : 0), 0);
    const target = Math.max(first.shippedQty, qty - restShipped);
    if (target === 0) await prisma.orderItem.delete({ where: { id: first.id } });
    else if (target !== first.quantity) await prisma.orderItem.update({ where: { id: first.id }, data: { quantity: target } });
  }
  const left = await prisma.orderItem.count({ where: { orderId: order.id } });
  if (left === 0) {
    await prisma.order.delete({ where: { id: order.id } });
    order = null;
  }
  return Response.json({ ok: true, orderId: order?.id ?? null });
}
