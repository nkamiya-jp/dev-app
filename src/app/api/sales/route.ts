import { prisma } from "@/lib/db";
import { salesMonth } from "@/lib/sales-month";

export const dynamic = "force-dynamic";

// GET /api/sales
// 受注を締日ベースで月次集計。顧客軸・商品軸の両方を返す
export async function GET() {
  const orders = await prisma.order.findMany({
    where: { status: { not: "cancelled" } },
    include: {
      contact: { select: { id: true, name: true, company: true, closingDay: true } },
      items: {
        include: { product: { select: { id: true, name: true, code: true, series: true } } },
      },
    },
  });

  // 月の集合
  const monthsSet = new Set<string>();

  // 顧客軸: contactId → { name, months: { ym: amount } }
  const byCustomer = new Map<string, { id: string; name: string; company: string | null; total: number; months: Record<string, number> }>();
  // 商品軸: productId → { name, months: { ym: amount } }
  const byProduct = new Map<string, { id: string; name: string; code: string | null; series: string | null; total: number; months: Record<string, number> }>();

  for (const o of orders) {
    const ym = salesMonth(o.orderDate, o.contact.closingDay);
    monthsSet.add(ym);

    // 受注合計（明細の単価×数量）
    const orderTotal = o.items.reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0);

    // 顧客軸
    if (!byCustomer.has(o.contact.id)) {
      byCustomer.set(o.contact.id, { id: o.contact.id, name: o.contact.name, company: o.contact.company, total: 0, months: {} });
    }
    const cust = byCustomer.get(o.contact.id)!;
    cust.months[ym] = (cust.months[ym] ?? 0) + orderTotal;
    cust.total += orderTotal;

    // 商品軸
    for (const it of o.items) {
      const amount = (it.unitPrice ?? 0) * it.quantity;
      const pid = it.product.id;
      if (!byProduct.has(pid)) {
        byProduct.set(pid, { id: pid, name: it.product.name, code: it.product.code, series: it.product.series, total: 0, months: {} });
      }
      const prod = byProduct.get(pid)!;
      prod.months[ym] = (prod.months[ym] ?? 0) + amount;
      prod.total += amount;
    }
  }

  // 月ラベル（新しい順）。データが無ければ直近6ヶ月
  let months = [...monthsSet].sort().reverse();
  if (months.length === 0) {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth() + 1;
    for (let i = 0; i < 6; i++) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
      m -= 1; if (m < 1) { m = 12; y -= 1; }
    }
  }

  const customers = [...byCustomer.values()].sort((a, b) => b.total - a.total);
  const products = [...byProduct.values()].sort((a, b) => b.total - a.total);

  // 月別合計
  const monthTotals: Record<string, number> = {};
  for (const c of customers) for (const [ym, v] of Object.entries(c.months)) monthTotals[ym] = (monthTotals[ym] ?? 0) + v;

  return Response.json({ months, customers, products, monthTotals, generatedAt: new Date().toISOString() });
}
