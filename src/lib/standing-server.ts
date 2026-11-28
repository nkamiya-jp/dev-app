// 定期顧客（顧客ページの☆）（サーバー側専用）
// ☆の付いたお客さんは、取扱商品ごとに商品別出荷管理・受注ページの発注カードにいつも並ぶ。
// その月の予測注文数は「顧客×商品×月」の予想（CustomerForecast。月の収支計画と同じデータ）に入れる。
// ☆の一覧は AppSetting（standing-contacts）に顧客IDの配列で持つ（列の追加なし）
import { prisma } from "@/lib/db";
import { compareProductOrder } from "@/lib/product-meta";
import { loadForecastCells, recurringQtyFor } from "@/lib/forecast-server";
import { todayJst } from "@/lib/roadmap/settings";

export const STANDING_CONTACTS_KEY = "standing-contacts";

export async function getStandingContactIds(): Promise<string[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: STANDING_CONTACTS_KEY } });
  if (!row) return [];
  try {
    const v = JSON.parse(row.value);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function setStandingContact(contactId: string, on: boolean) {
  const cur = await getStandingContactIds();
  const next = on ? [...new Set([...cur, contactId])] : cur.filter((id) => id !== contactId);
  const value = JSON.stringify(next);
  await prisma.appSetting.upsert({ where: { key: STANDING_CONTACTS_KEY }, update: { value }, create: { key: STANDING_CONTACTS_KEY, value } });
  return next;
}

/** その月の予測注文数を入れる（0は「この月は無し」）。毎月の定番数と同じなら個別の数は持たない（月の収支計画と同じ決まり） */
export async function setMonthForecast(contactId: string, productId: string, month: string, qty: number | null, by: string | null) {
  const key = { contactId, productId, month, kind: "forecast" };
  const rec = await recurringQtyFor(contactId, productId, month);
  if (qty == null || (rec != null && qty === rec)) {
    await prisma.customerForecast.deleteMany({ where: key });
    return;
  }
  await prisma.customerForecast.upsert({
    where: { contactId_productId_month_kind: key },
    update: { qty, updatedBy: by },
    create: { ...key, qty, updatedBy: by },
  });
}

export type StandingLine = {
  productId: string;
  code: string;
  name: string;
  /** その月の予測注文数（無ければ null） */
  forecast: number | null;
  /** その月の注文数（受注日がその月・キャンセル除く） */
  monthOrdered: number;
  /** 今週（月〜日）の注文数 */
  weekOrdered: number;
};
export type StandingCard = {
  contactId: string;
  label: string;
  /** 毎日伺うお客さん（Contact.dailyOrder） */
  perWeek: boolean;
  lines: StandingLine[];
  monthForecast: number;
  monthOrdered: number;
  weekOrdered: number;
  lastOrderDate: string | null;
};

const JST = 9 * 3600 * 1000;
const ymd = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

/** 今週（JSTの月曜0時〜翌週月曜0時） */
function thisWeekRange() {
  const t = new Date(`${todayJst()}T00:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7; // 月=0
  const start = new Date(t.getTime() - dow * 86400000 - JST);
  return { start, end: new Date(start.getTime() + 7 * 86400000) };
}

export async function loadStandingCards(month: string, opts?: { productIds?: string[] }): Promise<StandingCard[]> {
  const ids = await getStandingContactIds();
  if (ids.length === 0) return [];
  const [y, m] = month.split("-").map(Number);
  const mStart = new Date(`${month}-01T00:00:00+09:00`);
  const mEnd = new Date(Date.UTC(y, m, 1) - JST);
  const week = thisWeekRange();
  const pf = opts?.productIds ? { productId: { in: opts.productIds } } : {};
  const productSelect = { id: true, code: true, name: true, shortName: true, series: true, sortOrder: true, active: true } as const;

  const [contacts, handled, items, last, cells] = await Promise.all([
    prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, company: true, dailyOrder: true } }),
    // 並べる商品＝取扱商品
    prisma.customerPrice.findMany({ where: { contactId: { in: ids }, ...pf }, select: { contactId: true, product: { select: productSelect } } }),
    prisma.orderItem.findMany({
      where: {
        ...pf,
        order: { contactId: { in: ids }, status: { not: "cancelled" }, orderDate: { gte: new Date(Math.min(mStart.getTime(), week.start.getTime())), lt: new Date(Math.max(mEnd.getTime(), week.end.getTime())) } },
      },
      select: { quantity: true, product: { select: productSelect }, order: { select: { contactId: true, orderDate: true } } },
    }),
    prisma.order.groupBy({ by: ["contactId"], where: { contactId: { in: ids }, status: { not: "cancelled" } }, _max: { orderDate: true } }),
    loadForecastCells([month]),
  ]);
  const lastMap = new Map(last.map((l) => [l.contactId, l._max.orderDate]));

  // 顧客×商品の組（取扱商品＋その月・今週に注文があった商品）
  type P = { id: string; code: string; name: string; shortName: string | null; series: string | null; sortOrder: number; active: boolean };
  const pairs = new Map<string, Map<string, P>>();
  const add = (cid: string, p: P | null) => {
    if (!p || !p.active) return;
    const mp = pairs.get(cid) ?? new Map<string, P>();
    mp.set(p.id, p);
    pairs.set(cid, mp);
  };
  for (const h of handled) add(h.contactId, h.product);
  const agg = new Map<string, { month: number; week: number }>();
  for (const it of items) {
    if (!it.product || !it.order.contactId) continue;
    add(it.order.contactId, it.product);
    const k = `${it.order.contactId}|${it.product.id}`;
    const a = agg.get(k) ?? { month: 0, week: 0 };
    const t = it.order.orderDate.getTime();
    if (t >= mStart.getTime() && t < mEnd.getTime()) a.month += it.quantity;
    if (t >= week.start.getTime() && t < week.end.getTime()) a.week += it.quantity;
    agg.set(k, a);
  }

  const out: StandingCard[] = [];
  for (const c of contacts) {
    const prods = [...(pairs.get(c.id)?.values() ?? [])].sort(compareProductOrder);
    const lines: StandingLine[] = prods.map((p) => {
      const a = agg.get(`${c.id}|${p.id}`) ?? { month: 0, week: 0 };
      const cell = cells.get(`${month}|${c.id}|${p.id}`);
      return { productId: p.id, code: p.code, name: p.shortName || p.name, forecast: cell ? cell.qty : null, monthOrdered: a.month, weekOrdered: a.week };
    });
    if (opts?.productIds && lines.length === 0) continue;
    out.push({
      contactId: c.id,
      label: c.company || c.name,
      perWeek: c.dailyOrder,
      lines,
      monthForecast: lines.reduce((s, l) => s + (l.forecast ?? 0), 0),
      monthOrdered: lines.reduce((s, l) => s + l.monthOrdered, 0),
      weekOrdered: lines.reduce((s, l) => s + l.weekOrdered, 0),
      lastOrderDate: lastMap.get(c.id) ? ymd(lastMap.get(c.id)!) : null,
    });
  }
  // 毎日伺い → 発注 の順、その中は名前順
  out.sort((a, b) => Number(b.perWeek) - Number(a.perWeek) || a.label.localeCompare(b.label, "ja"));
  return out;
}
