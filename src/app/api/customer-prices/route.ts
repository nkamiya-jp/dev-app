import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/customer-prices?contactId=xxx - その顧客の取扱商品＋個別価格一覧
export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");
  if (!contactId) return Response.json({ error: "contactId required" }, { status: 400 });
  const rows = await prisma.customerPrice.findMany({
    where: { contactId },
    select: { productId: true, price: true, note: true },
  });
  return Response.json(rows);
}

// POST /api/customer-prices - 取扱商品を追加 or 個別価格/メモを更新（upsert）
// body: { contactId, productId, price?（null=自動）, note? }
// price / note は「渡されたキーだけ」更新する（片方だけの更新で他方を消さない）
export async function POST(request: NextRequest) {
  const data = await request.json();
  const { contactId, productId } = data;
  if (!contactId || !productId) {
    return Response.json({ error: "contactId and productId required" }, { status: 400 });
  }
  const hasPrice = "price" in data;
  const hasNote = "note" in data;
  const price = hasPrice
    ? (data.price === null || data.price === "" ? null : Math.round(Number(data.price)))
    : null;
  const note = hasNote ? (data.note || null) : null;
  const row = await prisma.customerPrice.upsert({
    where: { contactId_productId: { contactId, productId } },
    create: { contactId, productId, price, note },
    update: {
      ...(hasPrice && { price }),
      ...(hasNote && { note }),
    },
    select: { productId: true, price: true, note: true },
  });
  return Response.json(row);
}

// DELETE /api/customer-prices?contactId=xxx&productId=yyy - 取扱商品から削除
export async function DELETE(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");
  const productId = request.nextUrl.searchParams.get("productId");
  if (!contactId || !productId) {
    return Response.json({ error: "contactId and productId required" }, { status: 400 });
  }
  await prisma.customerPrice.deleteMany({ where: { contactId, productId } });
  return Response.json({ ok: true });
}
