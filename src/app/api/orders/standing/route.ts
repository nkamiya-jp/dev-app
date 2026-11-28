import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { loadStandingCards } from "@/lib/standing-server";
import { todayJst } from "@/lib/roadmap/settings";
import { getViewer, unauthorized } from "@/lib/viewer";

export const dynamic = "force-dynamic";

// GET /api/orders/standing?month=YYYY-MM — 定期のお客さん（発注カード）と今月・今週の注文
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("month") || "";
  const month = /^\d{4}-\d{2}$/.test(q) ? q : todayJst().slice(0, 7);
  return Response.json({ month, cards: await loadStandingCards(month) });
}

// 定期のお客さんの枠（顧客×商品）。数は月によって変わるので持たない（RecurringForecast を qty 0 で置く）
async function readBody(request: NextRequest) {
  const b = await request.json().catch(() => null);
  if (!b?.contactId || !b?.productId) return null;
  return { contactId: String(b.contactId), productId: String(b.productId) };
}

// POST /api/orders/standing { contactId, productId } — 枠を置く
export async function POST(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const b = await readBody(request);
  if (!b) return Response.json({ error: "顧客・商品を指定してください" }, { status: 400 });
  const exists = await prisma.recurringForecast.findUnique({ where: { contactId_productId: b } });
  if (exists) return Response.json({ ok: true });
  await prisma.recurringForecast.create({
    data: { ...b, qty: 0, startMonth: todayJst().slice(0, 7), updatedBy: v.name },
  });
  return Response.json({ ok: true });
}

// DELETE /api/orders/standing { contactId, productId } — 枠を外す
export async function DELETE(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const b = await readBody(request);
  if (!b) return Response.json({ error: "顧客・商品を指定してください" }, { status: 400 });
  const row = await prisma.recurringForecast.findUnique({ where: { contactId_productId: b } });
  if (!row) return Response.json({ ok: true });
  if (row.qty > 0) {
    return Response.json({ error: "月の収支計画の「毎月」に予想数が入っています。先にそちらを0にしてください" }, { status: 400 });
  }
  await prisma.recurringForecast.delete({ where: { contactId_productId: b } });
  return Response.json({ ok: true });
}
