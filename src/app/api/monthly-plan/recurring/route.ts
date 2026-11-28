import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getViewer, unauthorized } from "@/lib/viewer";
import { todayJst } from "@/lib/roadmap/settings";

export const dynamic = "force-dynamic";

// 数量だけ（金額は出さない）なのでログインしていれば誰でも
async function guard() {
  const v = await getViewer();
  if (!v) return { error: unauthorized() };
  return { v };
}

// GET /api/monthly-plan/recurring?contactId= — そのお客さんの想定（月あたり。伺うスタイルなら週あたり）
export async function GET(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const contactId = request.nextUrl.searchParams.get("contactId");
  if (!contactId) return Response.json({ error: "顧客を指定してください" }, { status: 400 });
  const rows = await prisma.recurringForecast.findMany({
    where: { contactId },
    select: { productId: true, qty: true, startMonth: true },
  });
  return Response.json(rows);
}

// PUT /api/monthly-plan/recurring { contactId, productId, qty, fromMonth? } — 毎月の定番の予想数。0で止める
// 新しく決めたときは fromMonth（未指定なら今月）から入る。過去の月は変えない
export async function PUT(request: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const b = await request.json();
  if (!b.contactId || !b.productId) return Response.json({ error: "顧客・商品を指定してください" }, { status: 400 });
  const contactId = String(b.contactId);
  const productId = String(b.productId);
  const qty = Math.max(0, Math.round(Number(b.qty) || 0));
  const thisMonth = todayJst().slice(0, 7);
  const from = /^\d{4}-\d{2}$/.test(String(b.fromMonth || "")) ? String(b.fromMonth) : thisMonth;
  const startMonth = from < thisMonth ? thisMonth : from;
  const key = { contactId_productId: { contactId, productId } };
  const before = await prisma.recurringForecast.findUnique({ where: key });
  if (before && before.startMonth < startMonth) {
    // 数を変えた・止めたとき、過去の月（今月より前）は変わった数にしない：前の数をその月の個別の数として残す
    const past: string[] = [];
    for (let m = before.startMonth; m < startMonth; m = nextMonth(m)) past.push(m);
    if (past.length > 0 && past.length <= 36) {
      const existing = await prisma.customerForecast.findMany({
        where: { contactId, productId, kind: "forecast", month: { in: past } },
        select: { month: true },
      });
      const has = new Set(existing.map((e) => e.month));
      const missing = past.filter((m) => !has.has(m));
      if (missing.length > 0) {
        await prisma.customerForecast.createMany({
          data: missing.map((month) => ({ contactId, productId, month, kind: "forecast", qty: before.qty, updatedBy: g.v.name })),
        });
      }
    }
  }
  if (qty === 0) {
    await prisma.recurringForecast.deleteMany({ where: { contactId, productId } });
    return Response.json({ ok: true });
  }
  await prisma.recurringForecast.upsert({
    where: key,
    update: { qty, startMonth, updatedBy: g.v.name },
    create: { contactId, productId, qty, startMonth, updatedBy: g.v.name },
  });
  return Response.json({ ok: true });
}

function nextMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
