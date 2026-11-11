import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";

export const dynamic = "force-dynamic";

async function guard() {
  const v = await getViewer();
  if (!v) return { error: unauthorized() };
  if (v.isPart) return { error: forbidden("売上の数字は表示できません") };
  return { v };
}

// PUT /api/monthly-plan/forecast { contactId, productId, month, kind: forecast|push, qty } — 0で消す
export async function PUT(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const b = await request.json();
  const month = String(b.month || "");
  if (!/^\d{4}-\d{2}$/.test(month) || !b.contactId || !b.productId) return Response.json({ error: "顧客・商品・月を指定してください" }, { status: 400 });
  const kind = b.kind === "push" ? "push" : "forecast";
  const qty = Math.max(0, Math.round(Number(b.qty) || 0));
  const key = { contactId: String(b.contactId), productId: String(b.productId), month, kind };
  if (qty === 0) {
    await prisma.customerForecast.deleteMany({ where: key });
    return Response.json({ ok: true });
  }
  await prisma.customerForecast.upsert({
    where: { contactId_productId_month_kind: key },
    update: { qty, updatedBy: g.v.name },
    create: { ...key, qty, updatedBy: g.v.name },
  });
  return Response.json({ ok: true });
}

// DELETE /api/monthly-plan/forecast?contactId=&productId=&month= — その月の1行（見込み・攻め）を消す
export async function DELETE(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const sp = request.nextUrl.searchParams;
  const contactId = sp.get("contactId");
  const productId = sp.get("productId");
  const month = sp.get("month");
  if (!contactId || !productId || !month) return Response.json({ error: "顧客・商品・月を指定してください" }, { status: 400 });
  await prisma.customerForecast.deleteMany({ where: { contactId, productId, month } });
  return Response.json({ ok: true });
}
