import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/jan/link { ids: string[], productId: string | null } — 選んだJANを商品マスタにまとめてひも付け（null で解除）
export async function POST(request: NextRequest) {
  const { ids, productId } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) return Response.json({ error: "ids required" }, { status: 400 });
  if (ids.length > 1000) return Response.json({ error: "1回は1000件までです" }, { status: 400 });
  if (productId) {
    const p = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!p) return Response.json({ error: "商品が見つかりません" }, { status: 404 });
  }
  const r = await prisma.janItem.updateMany({ where: { id: { in: ids } }, data: { productId: productId || null } });
  return Response.json({ updated: r.count });
}
