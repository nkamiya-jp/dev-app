import { NextRequest } from "next/server";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { buildMonthlyPlan, saveOverride } from "@/lib/monthly-plan-server";

export const dynamic = "force-dynamic";

// 売上の数字なのでパートには出さない（ロードマップの権限と同じ）
async function guard() {
  const v = await getViewer();
  if (!v) return { error: unauthorized() };
  if (v.isPart) return { error: forbidden("売上の数字は表示できません") };
  return { v };
}

// GET /api/monthly-plan?month=YYYY-MM — 選んだ月の明細と、12か月の必要売上・見込み・不足
export async function GET(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  return Response.json(await buildMonthlyPlan(request.nextUrl.searchParams.get("month")));
}

// PUT /api/monthly-plan { month, requiredSales?, purchase?, ad? } — 月の手入力（null で自動に戻す）
export async function PUT(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const b = await request.json();
  if (!/^\d{4}-\d{2}$/.test(String(b.month || ""))) return Response.json({ error: "月が正しくありません" }, { status: 400 });
  const { month, ...rest } = b;
  return Response.json(await saveOverride(month, rest));
}
