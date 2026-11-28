// 予想（見込み）の読み出し（サーバー側専用）
// 予想の正は「顧客×商品×月」。
// - その月に個別の数（CustomerForecast kind=forecast）があればそれ（0 も「今月は無し」として有効）
// - 無ければ、毎月の定番数（RecurringForecast）を startMonth 以降の月に入れる
//   毎日伺うお店（Contact.dailyOrder）の定番数は「週あたり」。月の予想は 週あたり×その月の日数÷7（四捨五入）
// 予想は注文の先取り（NAO 2026-11-28）：その月に注文が入った分だけ予想は減る＝見込み = max(受注済み, 予想)
import { prisma } from "@/lib/db";

export type ForecastCell = {
  qty: number;
  /** 定番数から入った値か（その月の個別の数が無い） */
  fromRecurring: boolean;
};

/** key = `${month}|${contactId}|${productId}` */
export async function loadForecastCells(months: string[], where?: { contactId?: string; productId?: string }) {
  const [rows, recurring] = await Promise.all([
    prisma.customerForecast.findMany({
      where: { month: { in: months }, kind: "forecast", ...where },
      select: { month: true, contactId: true, productId: true, qty: true },
    }),
    prisma.recurringForecast.findMany({
      where: { qty: { gt: 0 }, ...where },
      select: { contactId: true, productId: true, qty: true, startMonth: true, contact: { select: { dailyOrder: true } } },
    }),
  ]);
  const cells = new Map<string, ForecastCell>();
  for (const r of rows) cells.set(`${r.month}|${r.contactId}|${r.productId}`, { qty: r.qty, fromRecurring: false });
  for (const m of months) {
    for (const t of recurring) {
      if (m < t.startMonth) continue;
      const k = `${m}|${t.contactId}|${t.productId}`;
      if (!cells.has(k)) cells.set(k, { qty: monthlyQty(t.qty, t.contact.dailyOrder, m), fromRecurring: true });
    }
  }
  return cells;
}

/** 定番数 → その月の予想数（週あたりなら 日数÷7 倍） */
export function monthlyQty(qty: number, perWeek: boolean, month: string) {
  if (!perWeek) return qty;
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.round((qty * days) / 7);
}

/** 定番数がその月に効いているか（あれば、その月の予想数にして返す） */
export async function recurringQtyFor(contactId: string, productId: string, month: string) {
  const t = await prisma.recurringForecast.findUnique({
    where: { contactId_productId: { contactId, productId } },
    select: { qty: true, startMonth: true, contact: { select: { dailyOrder: true } } },
  });
  if (!t || t.qty <= 0 || month < t.startMonth) return null;
  return monthlyQty(t.qty, t.contact.dailyOrder, month);
}

const ymJst = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);

/**
 * その月の「まだ注文になっていない予想」を商品ごとに返す。
 * 顧客×商品ごとに max(0, 予想 − その月の受注数（受注日の月・キャンセル除く）) を足す。
 */
export async function forecastRemainByProduct(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(`${month}-01T00:00:00+09:00`);
  const next = new Date(Date.UTC(y, m, 1) - 9 * 3600 * 1000); // 翌月1日 0時（JST）
  const [cells, orders] = await Promise.all([
    loadForecastCells([month]),
    prisma.order.findMany({
      where: { status: { not: "cancelled" }, stage: { not: "cancelled" }, orderDate: { gte: start, lt: next } },
      select: { contactId: true, orderDate: true, items: { select: { productId: true, quantity: true } } },
    }),
  ]);
  const ordered = new Map<string, number>(); // contactId|productId
  for (const o of orders) {
    if (ymJst(o.orderDate) !== month) continue;
    for (const it of o.items) {
      const k = `${o.contactId}|${it.productId}`;
      ordered.set(k, (ordered.get(k) ?? 0) + it.quantity);
    }
  }
  const out = new Map<string, { forecast: number; ordered: number; remain: number }>();
  for (const [k, c] of cells) {
    const [, contactId, productId] = k.split("|");
    const o = ordered.get(`${contactId}|${productId}`) ?? 0;
    const cur = out.get(productId) ?? { forecast: 0, ordered: 0, remain: 0 };
    cur.forecast += c.qty;
    cur.ordered += Math.min(o, c.qty);
    cur.remain += Math.max(0, c.qty - o);
    out.set(productId, cur);
  }
  return out;
}
