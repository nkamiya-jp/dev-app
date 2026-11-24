import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { isYmd, parseEvent } from "@/lib/roadmap/portal";

export const dynamic = "force-dynamic";

// GET /api/roadmap/events?from=YYYY-MM-DD&to=YYYY-MM-DD — 会社カレンダー
// 「社長のみ」の予定は社長にだけ返す（画面で隠すのではなく送らない）
export async function GET(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const events = await prisma.companyEvent.findMany({
    where: {
      ...(!v.isPresident && { visibility: "全員" }),
      // 期間と重なる予定：開始 <= to かつ（終了 or 開始）>= from
      ...(isYmd(to) && { startDate: { lte: to } }),
      ...(isYmd(from) && { OR: [{ endDate: { gte: from } }, { endDate: null, startDate: { gte: from } }] }),
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    take: 500,
  });
  return Response.json({ events, canEdit: v.isPresident });
}

// POST /api/roadmap/events — 予定の追加（社長のみ）
export async function POST(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (!v.isPresident) return forbidden("会社カレンダーに書き込めるのは社長だけです");
  const r = parseEvent(await request.json());
  if ("error" in r) return Response.json({ error: r.error }, { status: 400 });
  const dup = await prisma.companyEvent.findUnique({ where: { startDate_title: { startDate: r.data.startDate, title: r.data.title } } });
  if (dup) return Response.json({ error: "同じ日に同じタイトルの予定があります。" }, { status: 400 });
  const ev = await prisma.companyEvent.create({ data: r.data });
  return Response.json(ev, { status: 201 });
}
