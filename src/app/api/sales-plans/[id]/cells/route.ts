import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";

export const dynamic = "force-dynamic";

// PUT /api/sales-plans/[id]/cells — 1マスの数を保存（0で削除）
// body: { kind: "production" | "sale", channel?, contactId?, month, qty }
//   または { cells: [...] } でまとめて（「均等に振る」など）
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (v.isPart) return forbidden("売上の数字は表示できません");
  const { id } = await params;
  const plan = await prisma.salesPlan.findUnique({ where: { id }, select: { id: true } });
  if (!plan) return Response.json({ error: "Not found" }, { status: 404 });

  const b = await request.json();
  const list: Record<string, unknown>[] = Array.isArray(b.cells) ? b.cells : [b];
  if (list.length > 200) return Response.json({ error: "一度に保存できるのは200マスまでです" }, { status: 400 });

  for (const c of list) {
    const kind = c.kind === "production" ? "production" : "sale";
    const month = String(c.month || "");
    if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: "月が正しくありません" }, { status: 400 });
    const channel = kind === "sale" ? String(c.channel || "") || null : null;
    const contactId = kind === "sale" ? String(c.contactId || "") || null : null;
    if (kind === "sale" && !channel) return Response.json({ error: "顧客カテゴリを選んでください" }, { status: 400 });
    const qty = Math.max(0, Math.round(Number(c.qty) || 0));

    // 同じマス（計画×種類×カテゴリ×顧客×月）は1行にまとめる。null どうしの一致は where で明示する
    const where = { planId: id, kind, month, channel, contactId };
    const existing = await prisma.salesPlanCell.findMany({ where, select: { id: true } });
    if (qty === 0) {
      if (existing.length) await prisma.salesPlanCell.deleteMany({ where: { id: { in: existing.map((e) => e.id) } } });
      continue;
    }
    if (existing.length) {
      await prisma.salesPlanCell.update({ where: { id: existing[0].id }, data: { qty } });
      if (existing.length > 1) await prisma.salesPlanCell.deleteMany({ where: { id: { in: existing.slice(1).map((e) => e.id) } } });
    } else {
      await prisma.salesPlanCell.create({ data: { ...where, qty } });
    }
  }
  await prisma.salesPlan.update({ where: { id }, data: { updatedAt: new Date() } });
  return Response.json({ ok: true });
}

// DELETE /api/sales-plans/[id]/cells?channel=&contactId= — 1行（カテゴリ×顧客）をまるごと消す
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (v.isPart) return forbidden("売上の数字は表示できません");
  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const channel = sp.get("channel") || null;
  const contactId = sp.get("contactId") || null;
  await prisma.salesPlanCell.deleteMany({ where: { planId: id, kind: "sale", channel, contactId } });
  return Response.json({ ok: true });
}
