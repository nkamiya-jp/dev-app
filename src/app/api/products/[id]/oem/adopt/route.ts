import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getViewer, unauthorized } from "@/lib/viewer";

export const dynamic = "force-dynamic";

// POST /api/products/[id]/oem/adopt { quoteId } — この見積の単価で決める
// 商品にOEM単価・倍率・決めた時の原価を控え、依頼主の顧客別価格にも入れる（リピートの受注で自動で入る）
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const { id } = await params;
  const { quoteId } = await request.json();
  const q = await prisma.oemQuote.findUnique({ where: { id: String(quoteId || "") } });
  if (!q || q.productId !== id) return Response.json({ error: "見積が見つかりません" }, { status: 404 });
  const p = await prisma.product.findUnique({ where: { id }, select: { ownerContactId: true } });
  if (!p?.ownerContactId) return Response.json({ error: "依頼主（顧客）が決まっていない商品です" }, { status: 400 });

  const date = q.createdAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
  await prisma.product.update({
    where: { id },
    data: {
      oemPrice: q.unitPrice,
      oemMultiplier: q.multiplier,
      oemIncludePackaging: q.includePackaging,
      oemPricedCost: q.unitCost,
      oemPricedAt: new Date(),
    },
  });
  await prisma.customerPrice.upsert({
    where: { contactId_productId: { contactId: p.ownerContactId, productId: id } },
    update: { price: q.unitPrice, note: `OEM見積（${date}・${q.quantity}個・×${q.multiplier}）` },
    create: { contactId: p.ownerContactId, productId: id, price: q.unitPrice, note: `OEM見積（${date}・${q.quantity}個・×${q.multiplier}）` },
  });
  await prisma.oemQuote.updateMany({ where: { productId: id, adopted: true }, data: { adopted: false } });
  await prisma.oemQuote.update({ where: { id: q.id }, data: { adopted: true } });
  return Response.json({ ok: true, price: q.unitPrice });
}
