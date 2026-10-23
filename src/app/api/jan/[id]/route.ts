import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.janItem.findUnique({
    where: { id },
    include: { product: { select: { id: true, code: true, name: true } } },
  });
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });
  // 同じ商品名・同じ商品マスタの他のJAN（柄違い）
  const siblings = await prisma.janItem.findMany({
    where: {
      id: { not: item.id },
      status: "used",
      OR: [
        ...(item.productName ? [{ productName: item.productName }] : []),
        ...(item.productId ? [{ productId: item.productId }] : []),
      ],
    },
    orderBy: { jan: "asc" },
    take: 300,
    select: { id: true, jan: true, patternCode: true, nameOther: true },
  });
  return Response.json({ ...item, siblings: item.productName || item.productId ? siblings : [] });
}

// PUT /api/jan/[id] — 編集（JAN自体は変更不可。番号を変えたい場合は新規登録）
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await request.json();
  const cur = await prisma.janItem.findUnique({ where: { id } });
  if (!cur) return Response.json({ error: "Not found" }, { status: 404 });

  const str = (k: string) => (b[k] === undefined ? undefined : String(b[k] ?? "").trim() || null);
  const status = b.status === undefined ? cur.status : b.status;
  if (!["used", "reserved", "free"].includes(status)) return Response.json({ error: "invalid status" }, { status: 400 });

  const productName = str("productName") === undefined ? cur.productName : str("productName");
  const nameOther = str("nameOther") === undefined ? cur.nameOther : str("nameOther");
  if (status === "used" && !productName && !nameOther) {
    return Response.json({ error: "使用中にするには商品名か名称他を入力してください" }, { status: 400 });
  }

  const item = await prisma.janItem.update({
    where: { id },
    data: {
      status,
      ...(b.productName !== undefined && { productName }),
      ...(b.nameOther !== undefined && { nameOther }),
      ...(b.patternCode !== undefined && { patternCode: str("patternCode") }),
      ...(b.productId !== undefined && { productId: b.productId || null }),
      ...(b.amazonListed !== undefined && { amazonListed: !!b.amazonListed }),
      ...(b.amazonComolife !== undefined && { amazonComolife: !!b.amazonComolife }),
      ...(b.pastAmazonListed !== undefined && { pastAmazonListed: !!b.pastAmazonListed }),
      ...(b.pastAmazonCode !== undefined && { pastAmazonCode: String(b.pastAmazonCode || "").replace(/\D/g, "") || null }),
      ...(b.note !== undefined && { note: str("note") }),
    },
  });
  return Response.json(item);
}
