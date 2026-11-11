import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";

export const dynamic = "force-dynamic";

// PUT /api/monthly-plan/production { productId, month, qty } — 生産の予定（今は手入力。0で消す）
export async function PUT(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (v.isPart) return forbidden("売上の数字は表示できません");
  const b = await request.json();
  const month = String(b.month || "");
  if (!/^\d{4}-\d{2}$/.test(month) || !b.productId) return Response.json({ error: "商品・月を指定してください" }, { status: 400 });
  const qty = Math.max(0, Math.round(Number(b.qty) || 0));
  const key = { productId: String(b.productId), month };
  if (qty === 0) await prisma.monthlyProduction.deleteMany({ where: key });
  else await prisma.monthlyProduction.upsert({ where: { productId_month: key }, update: { qty }, create: { ...key, qty } });
  return Response.json({ ok: true });
}
