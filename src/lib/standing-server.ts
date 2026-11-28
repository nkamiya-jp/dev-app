// 定期のお客さん（発注カード）（サーバー側専用）
// 商品別出荷管理で置いた「定期のお客さんの枠」（RecurringForecast。数は持たず qty 0 のことが多い）を、その月の注文と並べる。
// - 普通のお客さん：その月の発注があるか
// - 伺うスタイルのお客さん（Contact.dailyOrder、清水エリアなど）：今週・今月の注文
// qty>0 は月の収支計画の「毎月」の予想数（伺うスタイルは週あたり）
import { prisma } from "@/lib/db";
import { compareProductOrder } from "@/lib/product-meta";
import { monthlyQty } from "@/lib/forecast-server";
import { todayJst } from "@/lib/roadmap/settings";

export type StandingLine = {
  productId: string;
  code: string;
  name: string;
  /** 想定（perWeek なら週あたり、そうでなければ月あたり） */
  qty: number;
  /** その月の想定（週あたりは 日数÷7 倍） */
  monthQty: number;
  /** その月の注文数（受注日がその月・キャンセル除く） */
  monthOrdered: number;
  /** 今週（月〜日）の注文数。月が今月のときだけ意味がある */
  weekOrdered: number;
  /** 未出荷の残り（その月の注文分） */
  monthRemain: number;
};
export type StandingCard = {
  contactId: string;
  label: string;
  perWeek: boolean;
  lines: StandingLine[];
  monthQty: number;
  monthOrdered: number;
  weekQty: number;
  weekOrdered: number;
  lastOrderDate: string | null;
};

const JST = 9 * 3600 * 1000;
const ymd = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

/** 今週（JSTの月曜0時〜翌週月曜0時） */
function thisWeekRange() {
  const today = todayJst();
  const t = new Date(`${today}T00:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7; // 月=0
  const start = new Date(t.getTime() - dow * 86400000 - JST);
  return { start, end: new Date(start.getTime() + 7 * 86400000) };
}

export async function loadStandingCards(month: string, opts?: { productIds?: string[] }): Promise<StandingCard[]> {
  const [y, m] = month.split("-").map(Number);
  const mStart = new Date(`${month}-01T00:00:00+09:00`);
  const mEnd = new Date(Date.UTC(y, m, 1) - JST);
  const pf = opts?.productIds ? { productId: { in: opts.productIds } } : {};

  const recurring = await prisma.recurringForecast.findMany({
    where: { startMonth: { lte: month }, ...pf },
    select: {
      contactId: true, productId: true, qty: true,
      contact: { select: { id: true, name: true, company: true, dailyOrder: true } },
      product: { select: { id: true, code: true, name: true, shortName: true, series: true, sortOrder: true, active: true } },
    },
  });
  if (recurring.length === 0) return [];
  const contactIds = [...new Set(recurring.map((r) => r.contactId))];

  const week = thisWeekRange();
  const [items, last] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        ...pf,
        order: { contactId: { in: contactIds }, status: { not: "cancelled" }, orderDate: { gte: new Date(Math.min(mStart.getTime(), week.start.getTime())), lt: new Date(Math.max(mEnd.getTime(), week.end.getTime())) } },
      },
      select: { productId: true, quantity: true, shippedQty: true, order: { select: { contactId: true, orderDate: true } } },
    }),
    prisma.order.groupBy({
      by: ["contactId"],
      where: { contactId: { in: contactIds }, status: { not: "cancelled" } },
      _max: { orderDate: true },
    }),
  ]);
  const lastMap = new Map(last.map((l) => [l.contactId, l._max.orderDate]));

  const agg = new Map<string, { month: number; week: number; remain: number }>();
  for (const it of items) {
    const k = `${it.order.contactId}|${it.productId}`;
    const a = agg.get(k) ?? { month: 0, week: 0, remain: 0 };
    const t = it.order.orderDate.getTime();
    if (t >= mStart.getTime() && t < mEnd.getTime()) {
      a.month += it.quantity;
      a.remain += Math.max(0, it.quantity - it.shippedQty);
    }
    if (t >= week.start.getTime() && t < week.end.getTime()) a.week += it.quantity;
    agg.set(k, a);
  }

  const cards = new Map<string, StandingCard>();
  for (const r of recurring) {
    if (!r.product.active) continue;
    const c = cards.get(r.contactId) ?? {
      contactId: r.contactId,
      label: r.contact.company || r.contact.name,
      perWeek: r.contact.dailyOrder,
      lines: [],
      monthQty: 0, monthOrdered: 0, weekQty: 0, weekOrdered: 0,
      lastOrderDate: lastMap.get(r.contactId) ? ymd(lastMap.get(r.contactId)!) : null,
    };
    const a = agg.get(`${r.contactId}|${r.productId}`) ?? { month: 0, week: 0, remain: 0 };
    const mq = monthlyQty(r.qty, r.contact.dailyOrder, month);
    c.lines.push({
      productId: r.productId, code: r.product.code, name: r.product.shortName || r.product.name,
      qty: r.qty, monthQty: mq, monthOrdered: a.month, weekOrdered: a.week, monthRemain: a.remain,
    });
    c.monthQty += mq;
    c.monthOrdered += a.month;
    if (r.contact.dailyOrder) c.weekQty += r.qty;
    c.weekOrdered += a.week;
    cards.set(r.contactId, c);
  }
  const productOrder = new Map(
    recurring.map((r) => [r.productId, r.product]),
  );
  const out = [...cards.values()];
  for (const c of out) c.lines.sort((a, b) => compareProductOrder(productOrder.get(a.productId)!, productOrder.get(b.productId)!));
  // 伺うスタイル → 発注 の順、その中は名前順
  out.sort((a, b) => Number(b.perWeek) - Number(a.perWeek) || a.label.localeCompare(b.label, "ja"));
  return out;
}
