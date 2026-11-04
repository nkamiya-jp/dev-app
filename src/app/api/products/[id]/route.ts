import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { loadProductWithCost } from "@/lib/product-server";

export const dynamic = "force-dynamic";

// GET /api/products/[id] - 商品詳細（原価情報含む）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = await loadProductWithCost(id);
  if (!product) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(product);
}

// PUT - 商品本体の更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();
  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(data.code !== undefined && { code: data.code }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.series !== undefined && { series: data.series || null }),
      ...(data.size !== undefined && { size: data.size || null }),
      ...(data.retailPrice !== undefined && { retailPrice: data.retailPrice }),
      ...(data.costRatio !== undefined && { costRatio: data.costRatio }),
      ...(data.wholesalePrice !== undefined && { wholesalePrice: data.wholesalePrice }),
      ...(data.workerCost !== undefined && { workerCost: data.workerCost }),
      ...(data.salesCost !== undefined && { salesCost: data.salesCost }),
      ...(data.packagingCost !== undefined && { packagingCost: data.packagingCost }),
      ...(data.shippingCost !== undefined && { shippingCost: data.shippingCost }),
      ...(data.outboundCost !== undefined && { outboundCost: data.outboundCost }),
      ...(data.mgmtCost !== undefined && { mgmtCost: data.mgmtCost }),
      ...(data.purchaseCost !== undefined && { purchaseCost: data.purchaseCost }),
      ...(data.cutHeight !== undefined && { cutHeight: data.cutHeight }),
      ...(data.cutWidth !== undefined && { cutWidth: data.cutWidth }),
      ...(data.usedMeters !== undefined && { usedMeters: data.usedMeters }),
      ...(data.sizeW !== undefined && { sizeW: data.sizeW }),
      ...(data.sizeH !== undefined && { sizeH: data.sizeH }),
      ...(data.sizeD !== undefined && { sizeD: data.sizeD }),
      ...(data.weightG !== undefined && { weightG: data.weightG }),
      ...(data.leadText !== undefined && { leadText: data.leadText || null }),
      ...(data.tags !== undefined && { tags: data.tags || null }),
      ...(data.description !== undefined && { description: data.description || null }),
      ...(data.shortName !== undefined && { shortName: data.shortName || null }),
      ...(data.fnsku !== undefined && { fnsku: data.fnsku || null }),
      ...(data.hasNonwoven !== undefined && { hasNonwoven: !!data.hasNonwoven }),
      ...(data.active !== undefined && { active: data.active }),
      // OEMの依頼主（空にすると自社商品に戻る）
      ...(data.ownerContactId !== undefined && { ownerContactId: data.ownerContactId || null }),
    },
  });
  return Response.json(product);
}
