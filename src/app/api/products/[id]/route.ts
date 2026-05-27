import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/products/[id] - 商品詳細（原価情報含む）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const productRaw = await prisma.product.findUnique({
    where: { id },
    include: {
      costSteps: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      materials: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { material: { select: { fabricWidth: true } } },
      },
      inventory: true,
    },
  });
  if (!productRaw) return Response.json({ error: "Not found" }, { status: 404 });
  // material リレーション の fabricWidth をフラットに展開
  const product = {
    ...productRaw,
    materials: productRaw.materials.map((m) => ({
      ...m,
      fabricWidth: m.material?.fabricWidth ?? null,
    })),
  };
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
      ...(data.cutHeight !== undefined && { cutHeight: data.cutHeight }),
      ...(data.cutWidth !== undefined && { cutWidth: data.cutWidth }),
      ...(data.description !== undefined && { description: data.description || null }),
      ...(data.active !== undefined && { active: data.active }),
    },
  });
  return Response.json(product);
}
