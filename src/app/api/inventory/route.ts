import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET: 全商品の在庫情報を返す
// 在庫レコードがない商品は stock: 0 で返す
// 受注残（残数）も商品ごとに集計
export async function GET() {
  const [products, inventories, orderItems] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ series: "asc" }, { code: "asc" }],
    }),
    prisma.inventory.findMany(),
    prisma.orderItem.findMany({
      where: { order: { status: { in: ["pending", "in_progress"] } } },
      select: { productId: true, quantity: true, shippedQty: true },
    }),
  ]);

  const stockMap = new Map(inventories.map((i) => [i.productId, i.stock]));
  const backlogMap = new Map<string, number>();
  for (const it of orderItems) {
    const remain = it.quantity - it.shippedQty;
    backlogMap.set(it.productId, (backlogMap.get(it.productId) || 0) + remain);
  }

  const data = products.map((p) => ({
    ...p,
    stock: stockMap.get(p.id) || 0,
    backlog: backlogMap.get(p.id) || 0,
  }));
  return Response.json(data);
}

// 在庫を直接調整（棚卸し用）
export async function POST(request: NextRequest) {
  const { productId, stock, delta, note: _note } = await request.json();
  void _note;
  const existing = await prisma.inventory.findUnique({ where: { productId } });

  let newStock: number;
  if (delta !== undefined) {
    newStock = (existing?.stock || 0) + Number(delta);
  } else {
    newStock = Number(stock);
  }

  const inv = existing
    ? await prisma.inventory.update({
        where: { productId },
        data: { stock: newStock },
      })
    : await prisma.inventory.create({
        data: { productId, stock: newStock },
      });

  return Response.json(inv);
}
