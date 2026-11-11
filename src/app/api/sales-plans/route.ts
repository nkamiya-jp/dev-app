import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { getRoadmapSettings } from "@/lib/roadmap/settings";
import { buildPlanView } from "@/lib/sales-plan-server";

export const dynamic = "force-dynamic";

// 売上の数字なのでパートには出さない（ロードマップの権限と同じ）
async function guard() {
  const v = await getViewer();
  if (!v) return { error: unauthorized() };
  if (v.isPart) return { error: forbidden("売上の数字は表示できません") };
  return { v };
}

// GET /api/sales-plans?term= — 計画（シナリオ）の一覧と、それぞれの年計
export async function GET(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const term = request.nextUrl.searchParams.get("term") || (await getRoadmapSettings()).term;
  const plans = await prisma.salesPlan.findMany({ where: { term }, orderBy: [{ productId: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const items = [];
  for (const { id } of plans) {
    const v = await buildPlanView(id);
    if (!v) continue;
    items.push({ ...v.plan, product: v.product, year: v.result.year, grossRate: v.result.grossRate, payback: v.result.payback, lowestCash: v.result.lowestCash, stockShortMonth: v.result.stockShortMonth });
  }
  return Response.json({ term, items });
}

// POST /api/sales-plans { name, productId, term? }
export async function POST(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const b = await request.json();
  const name = String(b.name || "").trim();
  if (!name || !b.productId) return Response.json({ error: "名前と商品を入れてください" }, { status: 400 });
  const term = String(b.term || "").trim() || (await getRoadmapSettings()).term;
  const plan = await prisma.salesPlan.create({ data: { name, productId: String(b.productId), term, createdBy: g.v.name } });
  return Response.json({ id: plan.id }, { status: 201 });
}
