import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";

export const dynamic = "force-dynamic";

// PUT /api/roadmap/board/[id] — 編集・ピン留め（社長のみ）
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (!v.isPresident) return forbidden("掲示板を編集できるのは社長だけです");
  const { id } = await params;
  const b = await request.json();
  const data: { title?: string; body?: string; pinned?: boolean } = {};
  if (b.title !== undefined) {
    data.title = String(b.title).trim();
    if (!data.title) return Response.json({ error: "タイトルを入力してください。" }, { status: 400 });
  }
  if (b.body !== undefined) data.body = String(b.body);
  if (b.pinned !== undefined) data.pinned = !!b.pinned;
  const cur = await prisma.boardPost.findUnique({ where: { id } });
  if (!cur) return Response.json({ error: "投稿が見つかりません。" }, { status: 404 });
  const post = await prisma.boardPost.update({ where: { id }, data });
  return Response.json(post);
}

// DELETE /api/roadmap/board/[id] — 削除（社長のみ）
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (!v.isPresident) return forbidden("掲示板を削除できるのは社長だけです");
  const { id } = await params;
  await prisma.boardPost.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
