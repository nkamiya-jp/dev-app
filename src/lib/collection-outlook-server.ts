// 入金見込み（当月・翌月・翌々月）。サーバー側専用。
//
// 入金月 ＝ 売上月 ＋ 顧客の支払サイト（Contact.paymentMonthOffset。0=当月、未設定は翌月）。
// 売上の出どころは2つ：
//   1. FLAM売上集計（FlamSale）… 取り込み済みの月。計上済み＝あとは回収するだけ
//   2. DEVの未出荷の受注 … 納期（無ければ受注日）の月に出荷・計上する見込みとして数える。
//      納期を過ぎて未出荷のものは当月に寄せる（今月出せば今月の売上）
// 出荷済みの受注はFLAMに計上されている前提で、DEV側からは数えない（二重計上を避ける）。
// 金額はFLAMの純売上（税抜）と受注単価（税抜）に TAX_RATE を掛けた税込の概算。
import { prisma } from "@/lib/db";
import { todayJst } from "@/lib/roadmap/settings";
import { salesMonth } from "@/lib/sales-month";

export const TAX_RATE = 1.1;

// FLAMの回収サイクルには「当月」（0）もあるので、0はそのまま当月として扱う（未設定だけ翌月扱い）
const hasTerm = (offset: number | null | undefined) => offset != null && offset >= 0;
const payMonthOf = (salesYm: string, offset: number | null | undefined) => addMonths(salesYm, hasTerm(offset) ? offset! : 1);
function termLabel(offset: number | null | undefined, day: number | null | undefined) {
  const o = hasTerm(offset) ? offset! : 1;
  const m = o === 0 ? "当月" : o === 1 ? "翌月" : o === 2 ? "翌々月" : `${o}ヶ月後`;
  return `締め${m}${day && day >= 1 && day <= 30 ? `${day}日` : "末日"}払い`;
}

export interface OutlookCustomer {
  key: string; // contactId か flam:得意先コード
  contactId: string | null;
  name: string;
  term: string; // 支払条件の表示
  termIsDefault: boolean; // 支払サイト未設定（翌月扱い）
  payDay: number | null; // 入金日（null=末日）
  booked: number; // FLAM計上済み（税込概算）
  bookedMonths: string[]; // どの売上月の分か
  pending: number; // 未出荷受注の見込み（税込概算）
  pendingOrders: number;
  overdueOrders: number; // 納期を過ぎて未出荷
}

export interface OutlookMonth {
  month: string; // 入金月 YYYY-MM
  booked: number;
  pending: number;
  total: number;
  customers: OutlookCustomer[];
}

export interface CollectionOutlook {
  thisMonth: string;
  months: OutlookMonth[]; // [当月, 翌月, 翌々月]
  latestFlamMonth: string | null;
  missingFlamMonths: string[]; // 直近3ヶ月でFLAM売上が未取り込みの月（その分の入金が抜ける）
  lastImportedAt: string | null;
  unlinkedFlamCustomers: number; // DEVの顧客に紐づいていないFLAM得意先（翌月払いで計算）
  noTermContacts: number; // 入金見込みに出てくるのに支払サイト未設定の顧客
}

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// 日付をJSTの暦日として扱う
const jstDate = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));

export async function getCollectionOutlook(): Promise<CollectionOutlook> {
  const thisMonth = todayJst().slice(0, 7);
  const payMonths = [0, 1, 2].map((i) => addMonths(thisMonth, i));
  // 支払サイトは最大でも数ヶ月。売上月は当月の6ヶ月前まで見れば足りる
  const fromSalesMonth = addMonths(thisMonth, -6);

  const [contacts, flamRows, orders, last] = await Promise.all([
    prisma.contact.findMany({
      select: { id: true, name: true, company: true, flamCode: true, closingDay: true, paymentMonthOffset: true, paymentDay: true },
    }),
    prisma.flamSale.groupBy({
      by: ["month", "customerCode", "customerName"],
      where: { month: { gte: fromSalesMonth } },
      _sum: { amount: true },
    }),
    prisma.order.findMany({
      where: { status: { not: "cancelled" }, stage: { notIn: ["shipped", "cancelled"] } },
      select: {
        contactId: true,
        orderDate: true,
        dueDate: true,
        items: { select: { quantity: true, shippedQty: true, unitPrice: true } },
      },
    }),
    prisma.flamSale.aggregate({ _max: { importedAt: true, month: true } }),
  ]);

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const contactByFlam = new Map(contacts.filter((c) => c.flamCode).map((c) => [c.flamCode!, c]));
  const flamMonths = new Set(flamRows.map((r) => r.month));

  // 入金月 → 顧客key → 行
  const buckets = new Map<string, Map<string, OutlookCustomer>>(payMonths.map((m) => [m, new Map()]));
  const rowFor = (pm: string, key: string, base: () => Omit<OutlookCustomer, "booked" | "bookedMonths" | "pending" | "pendingOrders" | "overdueOrders">) => {
    const b = buckets.get(pm);
    if (!b) return null;
    let r = b.get(key);
    if (!r) {
      r = { ...base(), booked: 0, bookedMonths: [], pending: 0, pendingOrders: 0, overdueOrders: 0 };
      b.set(key, r);
    }
    return r;
  };
  const contactBase = (c: (typeof contacts)[number]) => () => ({
    key: c.id,
    contactId: c.id,
    name: c.company || c.name,
    term: termLabel(c.paymentMonthOffset, c.paymentDay),
    termIsDefault: !hasTerm(c.paymentMonthOffset),
    payDay: c.paymentDay && c.paymentDay >= 1 && c.paymentDay <= 30 ? c.paymentDay : null,
  });

  // 1. FLAM計上済み
  const unlinked = new Set<string>();
  for (const r of flamRows) {
    const amount = Math.round((r._sum.amount ?? 0) * TAX_RATE);
    if (amount === 0) continue;
    const c = contactByFlam.get(r.customerCode);
    if (!c) unlinked.add(r.customerCode);
    const pm = payMonthOf(r.month, c?.paymentMonthOffset);
    const row = c
      ? rowFor(pm, c.id, contactBase(c))
      : rowFor(pm, `flam:${r.customerCode}`, () => ({
          key: `flam:${r.customerCode}`,
          contactId: null,
          name: r.customerName,
          term: "締め翌月末日払い（DEV未登録）",
          termIsDefault: true,
          payDay: null,
        }));
    if (!row) continue;
    row.booked += amount;
    if (!row.bookedMonths.includes(r.month)) row.bookedMonths.push(r.month);
  }

  // 2. 未出荷の受注（出荷予定月の売上として）
  const today = todayJst();
  for (const o of orders) {
    const c = contactById.get(o.contactId);
    if (!c) continue;
    const amount = Math.round(
      o.items.reduce((s, it) => s + Math.max(0, it.quantity - it.shippedQty) * (it.unitPrice ?? 0), 0) * TAX_RATE,
    );
    if (amount === 0) continue;
    const plan = jstDate(o.dueDate ?? o.orderDate);
    const overdue = plan.toLocaleDateString("sv-SE") < today;
    let sm = salesMonth(plan, c.closingDay);
    if (sm < thisMonth) sm = thisMonth; // 遅れている分は今月出す前提
    // FLAMに取り込み済みの過去月に入るものは、上の判定で当月に寄るので重ならない
    const pm = payMonthOf(sm, c.paymentMonthOffset);
    const row = rowFor(pm, c.id, contactBase(c));
    if (!row) continue;
    row.pending += amount;
    row.pendingOrders += 1;
    if (overdue) row.overdueOrders += 1;
  }

  const months: OutlookMonth[] = payMonths.map((month) => {
    const customers = [...buckets.get(month)!.values()].sort((a, b) => b.booked + b.pending - (a.booked + a.pending));
    const booked = customers.reduce((s, c) => s + c.booked, 0);
    const pending = customers.reduce((s, c) => s + c.pending, 0);
    return { month, booked, pending, total: booked + pending, customers };
  });

  const shown = new Set(months.flatMap((m) => m.customers.filter((c) => c.contactId && c.termIsDefault).map((c) => c.contactId!)));

  return {
    thisMonth,
    months,
    latestFlamMonth: last._max.month ?? null,
    missingFlamMonths: [3, 2, 1].map((i) => addMonths(thisMonth, -i)).filter((m) => !flamMonths.has(m)),
    lastImportedAt: last._max.importedAt ? last._max.importedAt.toISOString() : null,
    unlinkedFlamCustomers: unlinked.size,
    noTermContacts: shown.size,
  };
}
