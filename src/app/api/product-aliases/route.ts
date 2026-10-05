import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeAliasLabel } from "@/lib/order-parse";

export const dynamic = "force-dynamic";

// POST /api/product-aliases  { aliases: [{ label, productId }] }
// 受注登録で担当者が確定した「書き方 → 商品」を記録する（同じ書き方は最新の対応で上書き）。
export async function POST(request: NextRequest) {
  const { aliases } = await request.json();
  if (!Array.isArray(aliases)) return Response.json({ error: "aliases required" }, { status: 400 });

  // 同じ書き方が複数あれば最後のものを採用し、件数を絞って1件ずつ upsert（大きなトランザクションは避ける）
  const map = new Map<string, string>();
  for (const a of aliases) {
    if (!a || typeof a.label !== "string" || typeof a.productId !== "string") continue;
    const label = normalizeAliasLabel(a.label);
    if (!label || label.length > 60) continue;
    map.set(label, a.productId);
  }

  let saved = 0;
  for (const [label, productId] of map) {
    await prisma.productAlias.upsert({
      where: { label },
      create: { label, productId },
      update: { productId },
    });
    saved++;
  }
  return Response.json({ ok: true, saved });
}
