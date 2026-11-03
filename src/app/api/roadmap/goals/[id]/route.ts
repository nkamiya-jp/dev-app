import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { canDelete, goalForViewer, pickEditable, type GoalInput } from "@/lib/roadmap/goal-rules";
import { checkGoalLinks } from "@/lib/roadmap/goal-links";

export const dynamic = "force-dynamic";

// PUT /api/roadmap/goals/[id] — 状態によって本人が直せる項目が変わる（goal-rules の pickEditable）
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const { id } = await params;
  const cur = await prisma.personalGoal.findUnique({ where: { id } });
  if (!cur) return Response.json({ error: "目標が見つかりません。" }, { status: 404 });
  if (!v.isPresident && cur.memberId !== v.memberId) return forbidden("他の人の目標は編集できません。");

  const b = (await request.json()) as GoalInput;
  const r = pickEditable(b, { isPresident: v.isPresident, kind: cur.kind, status: cur.status, isNew: false });
  if ("error" in r) return Response.json({ error: r.error }, { status: 400 });
  const d = r.data;
  if (d.goal !== undefined && !d.goal) return Response.json({ error: "目標を入力してください。" }, { status: 400 });
  const check = await checkGoalLinks(d, cur.memberId);
  if (check) return Response.json({ error: check }, { status: 400 });

  const goal = await prisma.personalGoal.update({
    where: { id },
    data: {
      ...(d.goal !== undefined && { goal: d.goal }),
      ...(d.qtype !== undefined && { qtype: d.qtype }),
      ...(d.criteria !== undefined && { criteria: d.criteria }),
      ...(d.kpi !== undefined && { kpi: d.kpi }),
      ...(d.target !== undefined && { target: d.target }),
      ...(d.result !== undefined && { result: d.result }),
      ...(d.progress !== undefined && { progress: d.progress }),
      ...(d.selfComment !== undefined && { selfComment: d.selfComment }),
      ...(d.parentId !== undefined && { parentId: d.parentId }),
      ...(cur.kind === "四半期" && d.bizGoalId !== undefined && { bizGoalId: d.bizGoalId }),
      ...(cur.kind === "四半期" && d.weight !== undefined && { weight: d.weight as number | null }),
      ...(cur.kind === "四半期" && d.quarter && { quarter: d.quarter }),
      ...(cur.kind === "月" && d.month && { month: d.month, quarter: d.quarter }),
      ...(d.selfGrade !== undefined && { selfGrade: d.selfGrade }),
      ...(d.fb !== undefined && { fb: d.fb }),
      ...(d.ceoGrade !== undefined && { ceoGrade: d.ceoGrade }),
      ...(d.ceoComment !== undefined && { ceoComment: d.ceoComment }),
      ...(d.status !== undefined && { status: d.status }),
    },
  });
  return Response.json(goalForViewer(goal, v.isPresident));
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const { id } = await params;
  const cur = await prisma.personalGoal.findUnique({ where: { id } });
  if (!cur) return Response.json({ error: "目標が見つかりません。" }, { status: 404 });
  const own = cur.memberId === v.memberId;
  if (!canDelete({ isPresident: v.isPresident, own, kind: cur.kind, status: cur.status })) {
    return forbidden("削除できるのは「設定中」の自分の目標と、自分の月目標だけです。");
  }
  // ひも付いていた下の目標は残す（ひも付けだけ外す）
  await prisma.personalGoal.updateMany({ where: { parentId: id }, data: { parentId: null } });
  await prisma.personalGoal.delete({ where: { id } });
  return Response.json({ ok: true });
}
