import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// "2026-09-01" のような日付文字列を ISO DateTime に揃える
function normalizeDate(v: unknown): string | undefined {
  if (typeof v !== "string" || !v) return undefined;
  return v.includes("T") ? v : new Date(v + "T00:00:00.000Z").toISOString();
}

// GET /api/milestones[?developmentId=xxx] - マイルストーン一覧
export async function GET(request: NextRequest) {
  const developmentId = request.nextUrl.searchParams.get("developmentId");
  const milestones = await prisma.milestone.findMany({
    where: developmentId ? { developmentId } : {},
    orderBy: { date: "asc" },
  });
  return Response.json(milestones);
}

// POST /api/milestones - 追加
export async function POST(request: NextRequest) {
  const data = await request.json();
  const date = normalizeDate(data.date);
  if (!data.developmentId || !data.title || !date) {
    return Response.json({ error: "developmentId, title, date required" }, { status: 400 });
  }
  const milestone = await prisma.milestone.create({
    data: {
      developmentId: data.developmentId,
      title: data.title,
      date,
      note: data.note || null,
      done: data.done ?? false,
    },
  });
  return Response.json(milestone, { status: 201 });
}

// PUT /api/milestones - 更新
export async function PUT(request: NextRequest) {
  const { id, ...rest } = await request.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const date = rest.date !== undefined ? normalizeDate(rest.date) : undefined;
  const milestone = await prisma.milestone.update({
    where: { id },
    data: {
      ...(rest.title !== undefined && { title: rest.title }),
      ...(date !== undefined && { date }),
      ...(rest.note !== undefined && { note: rest.note || null }),
      ...(rest.done !== undefined && { done: rest.done }),
    },
  });
  return Response.json(milestone);
}

// DELETE /api/milestones?id=xxx - 削除
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await prisma.milestone.delete({ where: { id } });
  return Response.json({ ok: true });
}
