import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { MONTH_GOAL_DEPT_FIELDS, canEditDept, isYm, pickFields } from "@/lib/roadmap/portal";
import { ensureStage3Tables } from "@/lib/roadmap/ensure-tables";

export const dynamic = "force-dynamic";

// PUT /api/roadmap/biz-month-goals/[id] — 社長は全項目。その部門の人は実績・担当コメント・状況だけ
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  await ensureStage3Tables();
  const { id } = await params;
  const cur = await prisma.bizMonthGoal.findUnique({ where: { id } });
  if (!cur) return Response.json({ error: "月目標が見つかりません。" }, { status: 404 });
  if (!canEditDept(v, cur.dept)) return forbidden("この月目標の実績は、その部門の人と社長だけが入れられます");
  const b = await request.json();

  if (!v.isPresident) {
    const g = await prisma.bizMonthGoal.update({ where: { id }, data: pickFields(b, MONTH_GOAL_DEPT_FIELDS) });
    return Response.json(g);
  }

  const data: Record<string, unknown> = pickFields(b, ["dept", "goal", "kpi", "target", "actual", "ownerComment", "ceoFb", "status"] as const);
  if ("goal" in data && !data.goal) return Response.json({ error: "目標を入力してください。" }, { status: 400 });
  if ("dept" in data && !data.dept) return Response.json({ error: "事業・部門を選んでください。" }, { status: 400 });
  if (b.month !== undefined) {
    if (!isYm(b.month)) return Response.json({ error: "月が正しくありません。" }, { status: 400 });
    data.month = b.month;
  }
  const g = await prisma.bizMonthGoal.update({ where: { id }, data });
  return Response.json(g);
}

// DELETE /api/roadmap/biz-month-goals/[id] — 削除（社長のみ）
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  await ensureStage3Tables();
  if (!v.isPresident) return forbidden("月目標を削除できるのは社長だけです");
  const { id } = await params;
  await prisma.bizMonthGoal.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
