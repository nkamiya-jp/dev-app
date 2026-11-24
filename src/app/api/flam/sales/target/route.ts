import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";

export const dynamic = "force-dynamic";

// PUT /api/flam/sales/target  { month: "YYYY-MM", amount: number|null }  null で目標を外す（仮目標に戻る）
export async function PUT(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (!v.isPresident) return forbidden("売上目標は社長だけが変えられます");
  const { month, amount } = await request.json();
  if (!/^\d{4}-\d{2}$/.test(String(month))) return Response.json({ error: "月の形式が違います" }, { status: 400 });
  if (amount === null || amount === "") {
    await prisma.salesTarget.deleteMany({ where: { month } });
    return Response.json({ ok: true, month, amount: null });
  }
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n < 0) return Response.json({ error: "金額が正しくありません" }, { status: 400 });
  await prisma.salesTarget.upsert({ where: { month }, create: { month, amount: n }, update: { amount: n } });
  return Response.json({ ok: true, month, amount: n });
}
