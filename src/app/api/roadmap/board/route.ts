import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { ensureStage3Tables } from "@/lib/roadmap/ensure-tables";

export const dynamic = "force-dynamic";

// GET /api/roadmap/board — 掲示板（ピン留め → 新しい順）。全員が読める
export async function GET() {
  const v = await getViewer();
  if (!v) return unauthorized();
  await ensureStage3Tables();
  const posts = await prisma.boardPost.findMany({ orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 200 });
  return Response.json({ posts, canPost: v.isPresident });
}

// POST /api/roadmap/board — 投稿（社長のみ）。body: { title, body, pinned }
export async function POST(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  await ensureStage3Tables();
  if (!v.isPresident) return forbidden("掲示板に投稿できるのは社長だけです");
  const b = await request.json();
  const title = String(b.title ?? "").trim();
  if (!title) return Response.json({ error: "タイトルを入力してください。" }, { status: 400 });
  const post = await prisma.boardPost.create({
    data: { title, body: String(b.body ?? ""), pinned: !!b.pinned, authorId: v.memberId, authorName: v.name },
  });
  return Response.json(post, { status: 201 });
}
