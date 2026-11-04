import { NextRequest } from "next/server";
import { duplicateProduct } from "@/lib/product-server";

export const dynamic = "force-dynamic";

// POST /api/products/[id]/duplicate
// 商品を原価データ（工程・生地・資材）ごと複製する
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dup = await duplicateProduct(id);
  if (!dup) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, id: dup.id, code: dup.code });
}
