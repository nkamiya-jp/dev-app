import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/labels
// 梱包作業カード用の「出荷」（既定=配送済を除く）と、
// Amazonバーコード用の商品（FNSKU付き）をまとめて返す。
export async function GET(request: NextRequest) {
  // all=1 で配送済(delivered)も含める
  const includeDelivered = request.nextUrl.searchParams.get("all") === "1";

  const rows = await prisma.shipment.findMany({
    where: includeDelivered ? {} : { status: { not: "delivered" } },
    include: {
      product: { select: { id: true, code: true, name: true, shortName: true } },
      contact: { select: { id: true, name: true, company: true } },
    },
    orderBy: [{ shipDate: "asc" }, { createdAt: "asc" }],
  });

  const shipments = rows.map((s) => ({
    shipmentId: s.id,
    orderId: s.orderId,
    productId: s.productId,
    productName: s.product?.name ?? "(商品なし)",
    shortName: s.product?.shortName ?? null,
    productCode: s.product?.code ?? "",
    contactName: s.contact?.name ?? "(顧客なし)",
    company: s.contact?.company ?? null,
    quantity: s.quantity,
    shipDate: s.shipDate,
    status: s.status,
    note: s.note,
  }));

  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ series: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, shortName: true, fnsku: true },
  });

  return Response.json({ shipments, products });
}
