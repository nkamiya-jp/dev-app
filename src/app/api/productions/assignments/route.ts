import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const data = await request.json();
  const assignment = await prisma.productionAssignment.create({
    data: {
      productionId: data.productionId,
      workerId: data.workerId,
      step: data.step || null,
      quantity: Number(data.quantity),
      note: data.note || null,
    },
  });
  return Response.json(assignment);
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  const before = await prisma.productionAssignment.findUnique({
    where: { id },
    include: { production: true },
  });
  if (!before) return Response.json({ error: "Not found" }, { status: 404 });

  const assignment = await prisma.productionAssignment.update({
    where: { id },
    data: {
      ...(rest.workerId && { workerId: rest.workerId }),
      ...(rest.step !== undefined && { step: rest.step || null }),
      ...(rest.quantity !== undefined && { quantity: Number(rest.quantity) }),
      ...(rest.deliveredQty !== undefined && { deliveredQty: Number(rest.deliveredQty) }),
      ...(rest.deliveredDate !== undefined && {
        deliveredDate: rest.deliveredDate ? new Date(rest.deliveredDate) : null,
      }),
      ...(rest.status && { status: rest.status }),
      ...(rest.note !== undefined && { note: rest.note || null }),
    },
  });

  // 在庫増減ロジック
  // delivered状態のときに deliveredQty 分が在庫加算済みとみなす
  const beforeApplied = before.status === "delivered" ? before.deliveredQty : 0;
  const afterApplied = assignment.status === "delivered" ? assignment.deliveredQty : 0;
  const delta = afterApplied - beforeApplied;

  if (delta !== 0) {
    const productId = before.production.productId;
    const inv = await prisma.inventory.findUnique({ where: { productId } });
    if (inv) {
      await prisma.inventory.update({
        where: { productId },
        data: { stock: inv.stock + delta },
      });
    } else {
      await prisma.inventory.create({
        data: { productId, stock: delta },
      });
    }
  }

  // 全Assignmentがdelivered なら、Production を delivered に
  const all = await prisma.productionAssignment.findMany({
    where: { productionId: before.productionId },
  });
  const allDelivered = all.length > 0 && all.every((a) => a.status === "delivered");
  const anyInProgress = all.some((a) => a.status === "in_progress");
  let newProductionStatus: string | undefined;
  if (allDelivered) newProductionStatus = "delivered";
  else if (anyInProgress) newProductionStatus = "in_progress";
  if (newProductionStatus && newProductionStatus !== before.production.status) {
    await prisma.production.update({
      where: { id: before.productionId },
      data: { status: newProductionStatus },
    });
  }

  return Response.json(assignment);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  const before = await prisma.productionAssignment.findUnique({
    where: { id },
    include: { production: true },
  });
  // 納品済みなら在庫から戻す
  if (before && before.status === "delivered" && before.deliveredQty > 0) {
    const inv = await prisma.inventory.findUnique({ where: { productId: before.production.productId } });
    if (inv) {
      await prisma.inventory.update({
        where: { productId: before.production.productId },
        data: { stock: inv.stock - before.deliveredQty },
      });
    }
  }
  await prisma.productionAssignment.delete({ where: { id } });
  return Response.json({ ok: true });
}
