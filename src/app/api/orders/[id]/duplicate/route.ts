import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/orders/[id]/duplicate
// 受注を明細ごと複製する。
// - ステータスは pending（未着手）にリセット
// - 出荷実績はコピーしない（shippedQty=0、出荷計画 monthlyPlans/weeklyPlans もリセット）
// - 商品・数量・単価はそのままコピー
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const src = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!src) return Response.json({ error: "Not found" }, { status: 404 });

  const dup = await prisma.order.create({
    data: {
      contactId: src.contactId,
      orderDate: src.orderDate,
      dueDate: src.dueDate,
      status: "pending",
      note: src.note,
      items: {
        create: src.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          shippedQty: 0,
          monthlyPlans: null,
          weeklyPlans: null,
        })),
      },
    },
    include: { items: true },
  });

  return Response.json({ ok: true, id: dup.id });
}
