import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { getRoadmapSettings } from "@/lib/roadmap/settings";
import { buildPlanView, monthsForTerm } from "@/lib/sales-plan-server";

export const dynamic = "force-dynamic";

interface Line {
  key: string;
  contactId: string | null;
  label: string;
  channel: string;
  channelLabel: string;
  amount: Record<string, number>;
  qty: Record<string, number>;
  products: { productId: string; name: string; qty: Record<string, number>; amount: Record<string, number> }[];
}

// GET /api/sales-plans/budgets?term= — 顧客ごとの月の予算（採用したシナリオの合計）
// 同じ商品の別案を二重に数えないよう、採用したシナリオだけを足す
export async function GET(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (v.isPart) return forbidden("売上の数字は表示できません");
  const term = request.nextUrl.searchParams.get("term") || (await getRoadmapSettings()).term;
  const months = await monthsForTerm(term);
  const plans = await prisma.salesPlan.findMany({ where: { term, adopted: true }, select: { id: true } });

  const lines = new Map<string, Line>();
  for (const { id } of plans) {
    const view = await buildPlanView(id);
    if (!view) continue;
    for (const r of view.rows) {
      const key = r.contactId ? `c:${r.contactId}` : `ch:${r.channel}`;
      if (!lines.has(key)) {
        lines.set(key, {
          key,
          contactId: r.contactId,
          label: r.contactId ? r.label : `${r.channelLabel}（顧客未定）`,
          channel: r.channel,
          channelLabel: r.channelLabel,
          amount: {},
          qty: {},
          products: [],
        });
      }
      const l = lines.get(key)!;
      const prod = { productId: view.product.id, name: view.product.name, qty: {} as Record<string, number>, amount: {} as Record<string, number> };
      for (const m of months) {
        const q = r.qty[m] || 0;
        if (!q) continue;
        prod.qty[m] = q;
        prod.amount[m] = q * r.price;
        l.qty[m] = (l.qty[m] || 0) + q;
        l.amount[m] = (l.amount[m] || 0) + q * r.price;
      }
      l.products.push(prod);
    }
  }

  const list = [...lines.values()].sort((a, b) => Number(!a.contactId) - Number(!b.contactId) || a.channelLabel.localeCompare(b.channelLabel, "ja") || a.label.localeCompare(b.label, "ja"));
  const monthTotals = Object.fromEntries(months.map((m) => [m, list.reduce((a, l) => a + (l.amount[m] || 0), 0)]));
  return Response.json({ term, months, adoptedPlans: plans.length, lines: list, monthTotals });
}
