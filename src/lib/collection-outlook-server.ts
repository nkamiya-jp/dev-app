// 入金見込み（当月・翌月・翌々月）。サーバー側専用。
//
// 正はFLAMの回収予定（FlamCollection：請求済みの伝票ごとの回収予定日・金額・入金額、税込）。
// 回収予定が取り込まれていない分は見込みで補う：
//   1. FLAM売上集計（FlamSale）… 計上済みだが、その入金月の回収予定に請求先が出ていない分（まだ請求前）
//   2. DEVの未出荷の受注 … 納期（遅れているものは今日）に出荷する前提で、締日→売上月→支払サイトで入金月を出す
// 入金月 ＝ 売上月 ＋ 顧客の支払サイト（Contact.paymentMonthOffset。0=当月、未設定は翌月）。
// 見込み（1・2）は税抜×TAX_RATE の概算。出荷済みの受注はFLAMに計上済みとみなしてDEV側からは数えない。
import { prisma } from "@/lib/db";
import { todayJst } from "@/lib/roadmap/settings";
import { salesMonth } from "@/lib/sales-month";

export const TAX_RATE = 1.1;

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// FLAMの回収サイクルには「当月」（0）もあるので、0はそのまま当月として扱う（未設定だけ翌月扱い）
const hasTerm = (offset: number | null | undefined) => offset != null && offset >= 0;
const payMonthOf = (salesYm: string, offset: number | null | undefined) => addMonths(salesYm, hasTerm(offset) ? offset! : 1);
function termLabel(offset: number | null | undefined, day: number | null | undefined) {
  const o = hasTerm(offset) ? offset! : 1;
  const m = o === 0 ? "当月" : o === 1 ? "翌月" : o === 2 ? "翌々月" : `${o}ヶ月後`;
  return `締め${m}${day && day >= 1 && day <= 30 ? `${day}日` : "末日"}払い`;
}

// 日付をJSTの暦日として扱う
const jstDate = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));

export interface OutlookCustomer {
  key: string; // contactId か flam:請求先コード
  contactId: string | null;
  name: string;
  term: string; // 支払条件の表示
  termIsDefault: boolean; // 支払サイト未設定（翌月扱い）
  dueDates: string[]; // FLAM回収予定日（MM-DD 昇順）
  invoiced: number; // FLAM回収予定（請求済み・税込）
  received: number; // そのうち入金済み
  estimate: number; // FLAM売上で請求前の分（税込概算）
  estimateMonths: string[]; // どの売上月の分か
  pending: number; // 未出荷受注の見込み（税込概算）
  pendingOrders: number;
  overdueOrders: number; // 納期を過ぎて未出荷
}

export interface OutlookMonth {
  month: string; // 入金月 YYYY-MM
  hasCollection: boolean; // FLAMの回収予定を取り込み済みか
  collectionImportedAt: string | null;
  carryover: number; // 前月までの未回収（FLAMの見出し「前月までの回収予定額」。当月のカードだけで使う）
  invoiced: number;
  received: number;
  estimate: number;
  pending: number;
  total: number; // invoiced + estimate + pending（前月までの分は含めない）
  customers: OutlookCustomer[];
}

export interface CollectionOutlook {
  thisMonth: string;
  months: OutlookMonth[]; // [当月, 翌月, 翌々月]
  latestFlamMonth: string | null;
  missingFlamMonths: string[]; // 直近3ヶ月でFLAM売上が未取り込みの月（回収予定が無い月の見込みが抜ける）
  unlinkedFlamCustomers: number; // DEVの顧客に紐づいていないFLAM得意先
  noTermContacts: number; // 見込みに出てくるのに支払サイト未設定の顧客
}

type Contact = {
  id: string; name: string; company: string | null; flamCode: string | null;
  closingDay: number | null; paymentMonthOffset: number | null; paymentDay: number | null;
};

export async function getCollectionOutlook(): Promise<CollectionOutlook> {
  const today = todayJst();
  const thisMonth = today.slice(0, 7);
  const payMonths = [0, 1, 2].map((i) => addMonths(thisMonth, i));
  const fromSalesMonth = addMonths(thisMonth, -6);

  const [contacts, flamRows, orders, last, collections, collectionHeads] = await Promise.all([
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
    prisma.flamSale.aggregate({ _max: { month: true } }),
    prisma.flamCollection.findMany({ where: { month: { in: payMonths } } }),
    prisma.flamCollectionMonth.findMany({ where: { month: { in: payMonths } } }),
  ]);

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const contactByFlam = new Map(contacts.filter((c) => c.flamCode).map((c) => [c.flamCode!, c]));
  const flamMonths = new Set(flamRows.map((r) => r.month));
  const headByMonth = new Map(collectionHeads.map((h) => [h.month, h]));
  // 回収予定に出ている請求先（入金月ごと）。ここに出ている請求先はFLAM売上からの見込みを足さない
  const invoicedCodes = new Map<string, Set<string>>(payMonths.map((m) => [m, new Set()]));
  for (const c of collections) if (c.kind !== "入金") invoicedCodes.get(c.month)?.add(c.customerCode);

  const buckets = new Map<string, Map<string, OutlookCustomer>>(payMonths.map((m) => [m, new Map()]));
  const blank = { dueDates: [], invoiced: 0, received: 0, estimate: 0, estimateMonths: [], pending: 0, pendingOrders: 0, overdueOrders: 0 };
  const rowFor = (pm: string, c: Contact | undefined, code: string, name: string): OutlookCustomer | null => {
    const b = buckets.get(pm);
    if (!b) return null;
    const key = c ? c.id : `flam:${code}`;
    let r = b.get(key);
    if (!r) {
      r = c
        ? {
            key, contactId: c.id, name: c.company || c.name,
            term: termLabel(c.paymentMonthOffset, c.paymentDay), termIsDefault: !hasTerm(c.paymentMonthOffset),
            ...structuredClone(blank),
          }
        : { key, contactId: null, name, term: "DEV未登録", termIsDefault: true, ...structuredClone(blank) };
      b.set(key, r);
    }
    return r;
  };

  const unlinked = new Set<string>();

  // 0. FLAMの回収予定（正）
  for (const col of collections) {
    const c = contactByFlam.get(col.customerCode);
    if (!c) unlinked.add(col.customerCode);
    const row = rowFor(col.month, c, col.customerCode, col.customerName);
    if (!row) continue;
    row.invoiced += col.amount;
    row.received += col.received;
    if (col.kind === "入金") continue; // 入金の行は日付が入金日なので回収予定日には出さない
    const md = col.dueDate.slice(5);
    if (!row.dueDates.includes(md)) row.dueDates.push(md);
  }

  // 1. FLAM売上のうち、まだ回収予定に出ていない分（請求前）
  for (const r of flamRows) {
    const amount = Math.round((r._sum.amount ?? 0) * TAX_RATE);
    if (amount === 0) continue;
    const c = contactByFlam.get(r.customerCode);
    const pm = payMonthOf(r.month, c?.paymentMonthOffset);
    if (invoicedCodes.get(pm)?.has(r.customerCode)) continue;
    if (pm < thisMonth) continue;
    // 回収予定を取り込んだ入金月では、締まった過去月の売上は請求済みのはず（載っていない＝回収済みか対象外）なので足さない。
    // 足すのは今月の売上（まだ締め・請求前のもの）だけ
    if (headByMonth.has(pm) && r.month < thisMonth) continue;
    if (!c) unlinked.add(r.customerCode);
    const row = rowFor(pm, c, r.customerCode, r.customerName);
    if (!row) continue;
    row.estimate += amount;
    if (!row.estimateMonths.includes(r.month)) row.estimateMonths.push(r.month);
  }

  // 2. 未出荷の受注（出荷予定日の売上として）
  for (const o of orders) {
    const c = contactById.get(o.contactId);
    if (!c) continue;
    const amount = Math.round(
      o.items.reduce((s, it) => s + Math.max(0, it.quantity - it.shippedQty) * (it.unitPrice ?? 0), 0) * TAX_RATE,
    );
    if (amount === 0) continue;
    const plan = jstDate(o.dueDate ?? o.orderDate);
    const overdue = plan.toLocaleDateString("sv-SE") < today;
    // 遅れている受注は今日出す前提で締日判定する
    const sm = salesMonth(overdue ? jstDate(new Date()) : plan, c.closingDay);
    const row = rowFor(payMonthOf(sm, c.paymentMonthOffset), c, c.flamCode ?? "", c.company || c.name);
    if (!row) continue;
    row.pending += amount;
    row.pendingOrders += 1;
    if (overdue) row.overdueOrders += 1;
  }

  const months: OutlookMonth[] = payMonths.map((month) => {
    const customers = [...buckets.get(month)!.values()];
    for (const c of customers) { c.dueDates.sort(); c.estimateMonths.sort(); }
    const sum = (f: (c: OutlookCustomer) => number) => customers.reduce((s, c) => s + f(c), 0);
    customers.sort((a, b) => b.invoiced + b.estimate + b.pending - (a.invoiced + a.estimate + a.pending));
    const head = headByMonth.get(month);
    const invoiced = sum((c) => c.invoiced);
    const estimate = sum((c) => c.estimate);
    const pending = sum((c) => c.pending);
    return {
      month,
      hasCollection: !!head,
      collectionImportedAt: head ? head.importedAt.toISOString() : null,
      // 翌月以降の「前月までの回収予定額」は当月分の未回収を含んだ累計で二重になるので、当月だけ出す
      carryover: month === thisMonth ? (head?.carryover ?? 0) : 0,
      invoiced,
      received: sum((c) => c.received),
      estimate,
      pending,
      total: invoiced + estimate + pending,
      customers,
    };
  });

  const noTerm = new Set(
    months.flatMap((m) => m.customers.filter((c) => c.contactId && c.termIsDefault && c.invoiced === 0).map((c) => c.contactId!)),
  );

  return {
    thisMonth,
    months,
    latestFlamMonth: last._max.month ?? null,
    missingFlamMonths: [3, 2, 1].map((i) => addMonths(thisMonth, -i)).filter((m) => !flamMonths.has(m)),
    unlinkedFlamCustomers: unlinked.size,
    noTermContacts: noTerm.size,
  };
}
