import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getViewer, unauthorized } from "@/lib/viewer";

export const dynamic = "force-dynamic";

// DELETE /api/oem/quotes/[id] — 見積の削除（単価を決めた見積は消せない）
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const { id } = await params;
  const q = await prisma.oemQuote.findUnique({ where: { id }, select: { adopted: true } });
  if (!q) return Response.json({ error: "見積が見つかりません" }, { status: 404 });
  if (q.adopted) return Response.json({ error: "単価を決めた見積は削除できません" }, { status: 400 });
  await prisma.oemQuote.delete({ where: { id } });
  return Response.json({ ok: true });
}
