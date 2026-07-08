import { prisma } from "@/lib/db";
import { salesMonth, paymentMonth } from "@/lib/sales-month";

export const dynamic = "force-dynamic";

interface Agg {
  id: string;
  name: string;
  company?: string | null;
  code?: string | null;
  series?: string | null;
  total: number;
  months: Record<string, number>;
}

function ensure(map: Map<string, Agg>, key: string, base: Omit<Agg, "total" | "months">): Agg {
  if (!map.has(key)) map.set(key, { ...base, total: 0, months: {} });
  return map.get(key)!;
}

// GET /api/sales
// 受注を「売上月（締日ベース）」と「着金予定月（支払サイトベース）」の2軸で集計。
// それぞれ顧客軸・商品軸を返す。
export async function GET() {
  const orders = await prisma.order.findMany({
    where: { status: { not: "cancelled" } },
    include: {
      contact: { select: { id: true, name: true, company: true, closingDay: true, paymentMonthOffset: true } },
      items: {
        include: { product: { select: { id: true, name: true, code: true, series: true } } },
      },
    },
  });

  const salesMonthsSet = new Set<string>();
  const payMonthsSet = new Set<string>();

  // 売上ベース
  const salesByCustomer = new Map<string, Agg>();
  const salesByProduct = new Map<string, Agg>();
  // 着金予定ベース
  const payByCustomer = new Map<string, Agg>();
  const payByProduct = new Map<string, Agg>();

  for (const o of orders) {
    const sYm = salesMonth(o.orderDate, o.contact.closingDay);
    const pYm = paymentMonth(sYm, o.contact.paymentMonthOffset);
    salesMonthsSet.add(sYm);
    payMonthsSet.add(pYm);

    const orderTotal = o.items.reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0);

    // 顧客軸（売上＆着金）
    const custBase = { id: o.contact.id, name: o.contact.name, company: o.contact.company };
    const sCust = ensure(salesByCustomer, o.contact.id, custBase);
    sCust.months[sYm] = (sCust.months[sYm] ?? 0) + orderTotal;
    sCust.total += orderTotal;
    const pCust = ensure(payByCustomer, o.contact.id, custBase);
    pCust.months[pYm] = (pCust.months[pYm] ?? 0) + orderTotal;
    pCust.total += orderTotal;

    // 商品軸（売上＆着金）
    for (const it of o.items) {
      const amount = (it.unitPrice ?? 0) * it.quantity;
      const prodBase = { id: it.product.id, name: it.product.name, code: it.product.code, series: it.product.series };
      const sProd = ensure(salesByProduct, it.product.id, prodBase);
      sProd.months[sYm] = (sProd.months[sYm] ?? 0) + amount;
      sProd.total += amount;
      const pProd = ensure(payByProduct, it.product.id, prodBase);
      pProd.months[pYm] = (pProd.months[pYm] ?? 0) + amount;
      pProd.total += amount;
    }
  }

  function fallbackMonths(set: Set<string>): string[] {
    const arr = [...set].sort().reverse();
    if (arr.length > 0) return arr;
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth() + 1;
    const out: string[] = [];
    for (let i = 0; i < 6; i++) { out.push(`${y}-${String(m).padStart(2, "0")}`); m -= 1; if (m < 1) { m = 12; y -= 1; } }
    return out;
  }
  function totalsOf(list: Agg[]): Record<string, number> {
    const t: Record<string, number> = {};
    for (const c of list) for (const [ym, v] of Object.entries(c.months)) t[ym] = (t[ym] ?? 0) + v;
    return t;
  }

  const salesCustomers = [...salesByCustomer.values()].sort((a, b) => b.total - a.total);
  const salesProducts = [...salesByProduct.values()].sort((a, b) => b.total - a.total);
  const payCustomers = [...payByCustomer.values()].sort((a, b) => b.total - a.total);
  const payProducts = [...payByProduct.values()].sort((a, b) => b.total - a.total);

  return Response.json({
    // 売上ベース
    sales: {
      months: fallbackMonths(salesMonthsSet),
      customers: salesCustomers,
      products: salesProducts,
      monthTotals: totalsOf(salesCustomers),
    },
    // 着金予定ベース
    payment: {
      months: fallbackMonths(payMonthsSet),
      customers: payCustomers,
      products: payProducts,
      monthTotals: totalsOf(payCustomers),
    },
    generatedAt: new Date().toISOString(),
  });
}
