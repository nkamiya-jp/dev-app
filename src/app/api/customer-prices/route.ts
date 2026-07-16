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

// POST /api/customer-prices - 取扱商品を追加 or 個別価格を更新（upsert）
// body: { contactId, productId, price?（null=自動）, note? }
export async function POST(request: NextRequest) {
  const data = await request.json();
  const { contactId, productId } = data;
  if (!contactId || !productId) {
    return Response.json({ error: "contactId and productId required" }, { status: 400 });
  }
  const price = data.price === undefined || data.price === null || data.price === "" ? null : Math.round(Number(data.price));
  const note = data.note ?? null;
  const row = await prisma.customerPrice.upsert({
    where: { contactId_productId: { contactId, productId } },
    create: { contactId, productId, price, note },
    update: { price, note },
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
