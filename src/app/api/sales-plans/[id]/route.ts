import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { buildPlanView } from "@/lib/sales-plan-server";

export const dynamic = "force-dynamic";

async function guard() {
  const v = await getViewer();
  if (!v) return { error: unauthorized() };
  if (v.isPart) return { error: forbidden("売上の数字は表示できません") };
  return { v };
}

// GET /api/sales-plans/[id] — 計画と計算結果（月・四半期・年）
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { id } = await params;
  const view = await buildPlanView(id);
  if (!view) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(view);
}

// PUT { name?, note?, adopted? } — 採用にすると、同じ商品・同じ期の他のシナリオは採用を外す
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { id } = await params;
  const b = await request.json();
  const cur = await prisma.salesPlan.findUnique({ where: { id } });
  if (!cur) return Response.json({ error: "Not found" }, { status: 404 });
  if (b.adopted === true) {
    await prisma.salesPlan.updateMany({ where: { productId: cur.productId, term: cur.term, adopted: true, id: { not: id } }, data: { adopted: false } });
  }
  const plan = await prisma.salesPlan.update({
    where: { id },
    data: {
      ...(b.name !== undefined && String(b.name).trim() && { name: String(b.name).trim() }),
      ...(b.note !== undefined && { note: String(b.note || "").trim() || null }),
      ...(b.adopted !== undefined && { adopted: !!b.adopted }),
      ...(b.openingStock !== undefined && { openingStock: Math.max(0, Math.round(Number(b.openingStock) || 0)) }),
    },
  });
  return Response.json(plan);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { id } = await params;
  await prisma.salesPlan.delete({ where: { id } });
  return Response.json({ ok: true });
}
