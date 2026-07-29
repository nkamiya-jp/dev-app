import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { effectiveStepCost } from "@/lib/product-cost";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") || "";
  const series = request.nextUrl.searchParams.get("series") || "";
  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";

  const where: Record<string, unknown> = {};
  if (!includeInactive) where.active = true;
  if (series) where.series = series;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { code: { contains: search } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: { inventory: true, costSteps: true },
  });
  // 一覧比較用に制作費（制作費カテゴリの工程合計・1個あたり）を付与
  const withCost = products.map((p) => {
    const productionCost = Math.round(
      p.costSteps
        .filter((s) => (s.category || "制作費") === "制作費")
        .reduce((sum, s) => sum + effectiveStepCost({ id: s.id, step: s.step, unitCost: s.unitCost, quantity: s.quantity, subType: s.subType }), 0)
    );
    const { costSteps: _omit, ...rest } = p;
    return { ...rest, productionCost };
  });
  return Response.json(withCost);
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const product = await prisma.product.create({
    data: {
      code: data.code,
      name: data.name,
      series: data.series || null,
      size: data.size || null,
      wholesalePrice: data.wholesalePrice ?? null,
      workerCost: data.workerCost ?? null,
      description: data.description || null,
      active: data.active ?? true,
    },
  });
  return Response.json(product);
}

export async function PUT(request: NextRequest) {
  const data = await request.json();
  const { id, ...rest } = data;
  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(rest.code !== undefined && { code: rest.code }),
      ...(rest.name !== undefined && { name: rest.name }),
      ...(rest.series !== undefined && { series: rest.series || null }),
      ...(rest.size !== undefined && { size: rest.size || null }),
      ...(rest.wholesalePrice !== undefined && { wholesalePrice: rest.wholesalePrice }),
      ...(rest.workerCost !== undefined && { workerCost: rest.workerCost }),
      ...(rest.description !== undefined && { description: rest.description || null }),
      ...(rest.active !== undefined && { active: rest.active }),
    },
  });
  return Response.json(product);
}

export async function DELETE(request: NextRequest) {
  const { id, hard } = await request.json();

  if (hard) {
    // 依存（受注明細・出荷・製造）が無ければ完全削除、あれば非アクティブ化
    const [orderItems, shipments, productions] = await Promise.all([
      prisma.orderItem.count({ where: { productId: id } }),
      prisma.shipment.count({ where: { productId: id } }),
      prisma.production.count({ where: { productId: id } }),
    ]);
    const deps = orderItems + shipments + productions;
    if (deps === 0) {
      // 在庫・原価工程・資材は cascade / 関連削除
      await prisma.inventory.deleteMany({ where: { productId: id } });
      await prisma.product.delete({ where: { id } });
      return Response.json({ ok: true, deleted: "hard" });
    }
    // 依存があるので非アクティブ化にフォールバック
    await prisma.product.update({ where: { id }, data: { active: false } });
    return Response.json({ ok: true, deleted: "soft", deps });
  }

  // 通常は非アクティブ化（取扱終了）
  await prisma.product.update({ where: { id }, data: { active: false } });
  return Response.json({ ok: true, deleted: "soft" });
}
