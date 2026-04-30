import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  const contactId = request.nextUrl.searchParams.get("contactId");
  const fromDate = request.nextUrl.searchParams.get("from");
  const toDate = request.nextUrl.searchParams.get("to");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (contactId) where.contactId = contactId;
  if (fromDate || toDate) {
    where.shipDate = {
      ...(fromDate ? { gte: new Date(fromDate) } : {}),
      ...(toDate ? { lte: new Date(toDate) } : {}),
    };
  }

  const shipments = await prisma.shipment.findMany({
    where,
    include: {
      contact: { select: { id: true, name: true, company: true, type: true } },
      product: { select: { id: true, code: true, name: true, series: true, wholesalePrice: true } },
      order: { select: { id: true } },
    },
    orderBy: { shipDate: "desc" },
  });
  return Response.json(shipments);
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const quantity = Number(data.quantity);
  const unitPrice = data.unitPrice ?? data.amount / quantity;
  const amount = data.amount ?? unitPrice * quantity;

  const shipment = await prisma.shipment.create({
    data: {
      orderId: data.orderId || null,
      contactId: data.contactId,
      productId: data.productId,
      shipDate: new Date(data.shipDate),
      quantity,
      amount,
      status: data.status || "scheduled",
      note: data.note || null,
    },
  });

  // 出荷確定のときだけ在庫減算 + OrderItem.shippedQty更新
  if (shipment.status === "shipped" || shipment.status === "delivered") {
    await applyShipmentEffects(shipment.id);
  }

  return Response.json(shipment);
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  const before = await prisma.shipment.findUnique({ where: { id } });
  if (!before) return Response.json({ error: "Not found" }, { status: 404 });

  const shipment = await prisma.shipment.update({
    where: { id },
    data: {
      ...(rest.shipDate && { shipDate: new Date(rest.shipDate) }),
      ...(rest.quantity !== undefined && { quantity: Number(rest.quantity) }),
      ...(rest.amount !== undefined && { amount: Number(rest.amount) }),
      ...(rest.status && { status: rest.status }),
      ...(rest.note !== undefined && { note: rest.note || null }),
    },
  });

  // ステータスが scheduled → shipped/delivered に変わったら在庫減算
  const wasOpen = before.status === "scheduled";
  const isClosed = shipment.status === "shipped" || shipment.status === "delivered";
  if (wasOpen && isClosed) {
    await applyShipmentEffects(shipment.id);
  }
  // 逆に shipped → scheduled に戻したら在庫戻し
  if (!wasOpen && shipment.status === "scheduled") {
    await revertShipmentEffects(shipment.id, before);
  }

  return Response.json(shipment);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  const before = await prisma.shipment.findUnique({ where: { id } });
  if (before && (before.status === "shipped" || before.status === "delivered")) {
    await revertShipmentEffects(id, before);
  }
  await prisma.shipment.delete({ where: { id } });
  return Response.json({ ok: true });
}

async function applyShipmentEffects(shipmentId: string) {
  const s = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!s) return;
  // 在庫を減らす
  const inv = await prisma.inventory.findUnique({ where: { productId: s.productId } });
  if (inv) {
    await prisma.inventory.update({
      where: { productId: s.productId },
      data: { stock: inv.stock - s.quantity },
    });
  } else {
    await prisma.inventory.create({
      data: { productId: s.productId, stock: -s.quantity },
    });
  }
  // OrderItemの出荷済数を増やす
  if (s.orderId) {
    const item = await prisma.orderItem.findFirst({
      where: { orderId: s.orderId, productId: s.productId },
    });
    if (item) {
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { shippedQty: item.shippedQty + s.quantity },
      });
    }
  }
}

async function revertShipmentEffects(
  shipmentId: string,
  before: { quantity: number; productId: string; orderId: string | null }
) {
  // 在庫を戻す
  const inv = await prisma.inventory.findUnique({ where: { productId: before.productId } });
  if (inv) {
    await prisma.inventory.update({
      where: { productId: before.productId },
      data: { stock: inv.stock + before.quantity },
    });
  }
  // OrderItem.shippedQtyを減らす
  if (before.orderId) {
    const item = await prisma.orderItem.findFirst({
      where: { orderId: before.orderId, productId: before.productId },
    });
    if (item) {
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { shippedQty: Math.max(0, item.shippedQty - before.quantity) },
      });
    }
  }
}
