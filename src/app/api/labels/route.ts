import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/labels
// 梱包作業カード用の受注明細（未出荷=残ありを既定）と、
// Amazonバーコード用の商品（FNSKU付き）をまとめて返す。
export async function GET(request: NextRequest) {
  const includeShipped = request.nextUrl.searchParams.get("all") === "1";

  const items = await prisma.orderItem.findMany({
    where: { order: { status: { not: "cancelled" } } },
    include: {
      product: { select: { id: true, code: true, name: true, shortName: true } },
      order: {
        select: {
          id: true,
          orderDate: true,
          dueDate: true,
          contact: { select: { id: true, name: true, company: true } },
        },
      },
    },
    orderBy: [{ order: { dueDate: "asc" } }, { order: { orderDate: "asc" } }],
  });

  const orderItems = items
    .map((it) => {
      const remain = it.quantity - it.shippedQty;
      return {
        itemId: it.id,
        orderId: it.order.id,
        productId: it.product?.id ?? null,
        productName: it.product?.name ?? "(商品なし)",
        shortName: it.product?.shortName ?? null,
        productCode: it.product?.code ?? "",
        contactName: it.order.contact?.name ?? "(顧客なし)",
        company: it.order.contact?.company ?? null,
        quantity: it.quantity,
        shippedQty: it.shippedQty,
        remainQty: remain,
        orderDate: it.order.orderDate,
        dueDate: it.order.dueDate,
      };
    })
    .filter((r) => includeShipped || r.remainQty > 0);

  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ series: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, shortName: true, fnsku: true },
  });

  return Response.json({ orderItems, products });
}
