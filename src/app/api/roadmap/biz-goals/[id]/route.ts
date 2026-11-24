import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { BIZ_GOAL_DEPT_FIELDS, BIZ_PERIODS, canEditBizOwner, pickFields } from "@/lib/roadmap/portal";

export const dynamic = "force-dynamic";

// PUT /api/roadmap/biz-goals/[id] — 社長は全項目。担当が自部門（または本人）の人は実績・状況だけ
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const { id } = await params;
  const cur = await prisma.bizGoal.findUnique({ where: { id } });
  if (!cur) return Response.json({ error: "事業目標が見つかりません。" }, { status: 404 });
  if (!canEditBizOwner(v, cur.owner)) return forbidden("この事業目標の実績は担当の部門の人と社長だけが入れられます");
  const b = await request.json();

  if (!v.isPresident) {
    const data = pickFields(b, BIZ_GOAL_DEPT_FIELDS);
    const g = await prisma.bizGoal.update({ where: { id }, data });
    return Response.json(g);
  }

  const data: Record<string, unknown> = pickFields(b, ["goal", "kpi", "target", "actual", "owner", "status", "comment"] as const);
  if ("goal" in data && !data.goal) return Response.json({ error: "目標を入力してください。" }, { status: 400 });
  if (b.period !== undefined) {
    if (!(BIZ_PERIODS as readonly string[]).includes(String(b.period))) return Response.json({ error: "期間が正しくありません。" }, { status: 400 });
    data.period = String(b.period);
    data.grain = b.period === "年間" ? "年間" : "四半期";
  }
  if (b.sortOrder !== undefined && Number.isFinite(Number(b.sortOrder))) data.sortOrder = Math.round(Number(b.sortOrder));
  const g = await prisma.bizGoal.update({ where: { id }, data });
  return Response.json(g);
}

// DELETE /api/roadmap/biz-goals/[id] — 削除（社長のみ）。ひも付いた個人目標は「会社の目標なし」に戻る
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (!v.isPresident) return forbidden("事業目標を削除できるのは社長だけです");
  const { id } = await params;
  await prisma.bizGoal.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
