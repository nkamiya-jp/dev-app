import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";

export const dynamic = "force-dynamic";

// PUT /api/monthly-plan/budget { month, channel, amount } — 不足を埋めるためにカテゴリへ振る攻めの予算（売上）
export async function PUT(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (v.isPart) return forbidden("売上の数字は表示できません");
  const b = await request.json();
  const month = String(b.month || "");
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: "月が正しくありません" }, { status: 400 });
  const channel = String(b.channel ?? "");
  const amount = Math.max(0, Math.round(Number(b.amount) || 0));
  const key = { month, channel };
  if (amount === 0) await prisma.monthlyChannelBudget.deleteMany({ where: key });
  else await prisma.monthlyChannelBudget.upsert({ where: { month_channel: key }, update: { amount }, create: { ...key, amount } });
  return Response.json({ ok: true });
}
