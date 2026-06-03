import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET - 特定スナップショットの中身
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const snap = await prisma.priceListSnapshot.findUnique({
    where: { id },
    include: { items: { orderBy: [{ series: "asc" }, { productCode: "asc" }] } },
  });
  if (!snap) return Response.json({ error: "Not found" }, { status: 404 });

  // prices JSON を展開
  const items = snap.items.map((it) => ({
    ...it,
    prices: JSON.parse(it.prices) as Record<string, number>,
  }));

  return Response.json({ ...snap, items });
}

// PUT - 名前・メモ変更
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();
  const snap = await prisma.priceListSnapshot.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.note !== undefined && { note: data.note || null }),
    },
  });
  return Response.json(snap);
}
