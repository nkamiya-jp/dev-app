import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { saveContactGroupOrder } from "@/lib/contact-order-server";

export const dynamic = "force-dynamic";

// PUT /api/contacts/order { ids: string[] } — 1つのタイプの中の並び順を保存（顧客ページの並べ替え）
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
    return Response.json({ error: "ids（顧客IDの配列）を指定してください" }, { status: 400 });
  }
  const uniq = [...new Set(ids as string[])];
  // 同じタイプの顧客だけを受け付ける（タイプをまたぐ並べ替えはできない）
  const found = await prisma.contact.findMany({ where: { id: { in: uniq } }, select: { id: true, type: true } });
  if (found.length !== uniq.length) return Response.json({ error: "見つからない顧客があります。画面を読み込み直してください" }, { status: 400 });
  if (new Set(found.map((c) => c.type ?? "")).size > 1) {
    return Response.json({ error: "並べ替えは同じタイプの中だけでできます" }, { status: 400 });
  }
  await saveContactGroupOrder(uniq);
  return Response.json({ ok: true });
}
