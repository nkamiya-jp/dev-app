import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { parseEvent } from "@/lib/roadmap/portal";

export const dynamic = "force-dynamic";

// PUT /api/roadmap/events/[id] — 予定の編集（社長のみ）
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (!v.isPresident) return forbidden("会社カレンダーを編集できるのは社長だけです");
  const { id } = await params;
  const r = parseEvent(await request.json());
  if ("error" in r) return Response.json({ error: r.error }, { status: 400 });
  const cur = await prisma.companyEvent.findUnique({ where: { id } });
  if (!cur) return Response.json({ error: "予定が見つかりません。" }, { status: 404 });
  const dup = await prisma.companyEvent.findUnique({ where: { startDate_title: { startDate: r.data.startDate, title: r.data.title } } });
  if (dup && dup.id !== id) return Response.json({ error: "同じ日に同じタイトルの予定があります。" }, { status: 400 });
  const ev = await prisma.companyEvent.update({ where: { id }, data: r.data });
  return Response.json(ev);
}

// DELETE /api/roadmap/events/[id] — 予定の削除（社長のみ）
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (!v.isPresident) return forbidden("会社カレンダーを編集できるのは社長だけです");
  const { id } = await params;
  await prisma.companyEvent.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
