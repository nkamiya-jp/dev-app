import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { compareProductOrder } from "@/lib/product-meta";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dev = await prisma.development.findUnique({
    where: { id },
    include: {
      product: true,
      contact: { select: { id: true, name: true, company: true } },
      tasks: { orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
      milestones: { orderBy: { date: "asc" } },
      orders: {
        orderBy: { orderDate: "desc" },
        include: {
          contact: { select: { id: true, name: true, company: true } },
          items: { include: { product: { select: { id: true, code: true, name: true } } } },
        },
      },
    },
  });
  if (!dev) return Response.json({ error: "Not found" }, { status: 404 });

  // 量産の進み具合：プロジェクトの商品＋ひもづいた受注の商品ごとに
  // 受注数・出荷済・製造依頼・完成（内職の納品済）・在庫 をまとめる。
  // 製造は商品単位の記録なので、プロジェクト開始日以降の依頼に絞る（仮制作は除く）。
  const productIds = new Set<string>();
  if (dev.productId) productIds.add(dev.productId);
  const activeOrders = dev.orders.filter((o) => o.status !== "cancelled");
  for (const o of activeOrders) for (const it of o.items) productIds.add(it.productId);

  const since = dev.startDate ?? dev.createdAt;
  const [products, productions] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: [...productIds] } },
      select: { id: true, code: true, name: true, series: true, sortOrder: true, inventory: { select: { stock: true } } },
    }),
    prisma.production.findMany({
      where: { productId: { in: [...productIds] }, provisional: false, requestDate: { gte: since } },
      select: { productId: true, quantity: true, status: true, assignments: { select: { deliveredQty: true } } },
    }),
  ]);

  const massSummary = products.sort(compareProductOrder).map((p) => {
    let ordered = 0;
    let shipped = 0;
    for (const o of activeOrders) {
      for (const it of o.items) {
        if (it.productId !== p.id) continue;
        ordered += it.quantity;
        shipped += it.shippedQty;
      }
    }
    const prods = productions.filter((x) => x.productId === p.id);
    const requested = prods.reduce((s, x) => s + x.quantity, 0);
    const completed = prods.reduce((s, x) => s + x.assignments.reduce((a, b) => a + b.deliveredQty, 0), 0);
    return {
      productId: p.id,
      code: p.code,
      name: p.name,
      ordered,
      shipped,
      requested,
      completed,
      stock: p.inventory?.stock ?? 0,
    };
  });

  return Response.json({ ...dev, massSummary });
}
