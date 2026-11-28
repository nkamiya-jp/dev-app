import { NextRequest } from "next/server";
import { loadStandingCards, setStandingContact, setMonthForecast, getStandingContactIds } from "@/lib/standing-server";
import { todayJst } from "@/lib/roadmap/settings";
import { getViewer, unauthorized } from "@/lib/viewer";

export const dynamic = "force-dynamic";

// GET /api/orders/standing?month=YYYY-MM[&contactId=] — 定期顧客（☆）の発注カード。contactId 指定時は ☆かどうかだけ
export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");
  if (contactId) return Response.json({ standing: (await getStandingContactIds()).includes(contactId) });
  const q = request.nextUrl.searchParams.get("month") || "";
  const month = /^\d{4}-\d{2}$/.test(q) ? q : todayJst().slice(0, 7);
  return Response.json({ month, cards: await loadStandingCards(month) });
}

// PATCH /api/orders/standing { contactId, standing: boolean } — 顧客ページの☆（定期顧客）
export async function PATCH(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const b = await request.json().catch(() => null);
  if (!b?.contactId) return Response.json({ error: "顧客を指定してください" }, { status: 400 });
  await setStandingContact(String(b.contactId), !!b.standing);
  return Response.json({ ok: true });
}

// PUT /api/orders/standing { contactId, productId, month, qty } — その月の予測注文数（空=null で消す）。数だけなのでログインしていれば誰でも
export async function PUT(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const b = await request.json().catch(() => null);
  const month = String(b?.month || "");
  if (!b?.contactId || !b?.productId || !/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: "顧客・商品・月を指定してください" }, { status: 400 });
  const qty = b.qty === null || b.qty === "" || b.qty === undefined ? null : Math.max(0, Math.round(Number(b.qty) || 0));
  await setMonthForecast(String(b.contactId), String(b.productId), month, qty, v.name);
  return Response.json({ ok: true });
}
