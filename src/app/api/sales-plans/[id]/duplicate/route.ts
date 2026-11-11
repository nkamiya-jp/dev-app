import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";

export const dynamic = "force-dynamic";

// POST /api/sales-plans/[id]/duplicate — シナリオをコピー（別案を作って比べる）
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (v.isPart) return forbidden("売上の数字は表示できません");
  const { id } = await params;
  const src = await prisma.salesPlan.findUnique({ where: { id }, include: { cells: true } });
  if (!src) return Response.json({ error: "Not found" }, { status: 404 });
  const plan = await prisma.salesPlan.create({
    data: {
      name: `${src.name}（コピー）`,
      term: src.term,
      productId: src.productId,
      note: src.note,
      openingStock: src.openingStock,
      createdBy: v.name,
      cells: { create: src.cells.map((c) => ({ kind: c.kind, channel: c.channel, contactId: c.contactId, month: c.month, qty: c.qty })) },
    },
  });
  return Response.json({ id: plan.id }, { status: 201 });
}
