import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { getRoadmapSettings } from "@/lib/roadmap/settings";
import { isYm, pickFields } from "@/lib/roadmap/portal";

export const dynamic = "force-dynamic";

// POST /api/roadmap/biz-month-goals — 事業別の月目標を追加（社長のみ）。一覧は GET /api/roadmap/biz-goals に含まれる
export async function POST(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (!v.isPresident) return forbidden("月目標を追加できるのは社長だけです");
  const b = await request.json();
  const { term } = await getRoadmapSettings();
  if (!isYm(b.month)) return Response.json({ error: "月を選んでください。" }, { status: 400 });
  const f = pickFields(b, ["dept", "goal", "kpi", "target", "actual", "ownerComment", "ceoFb", "status"] as const);
  if (!f.dept) return Response.json({ error: "事業・部門を選んでください。" }, { status: 400 });
  if (!f.goal) return Response.json({ error: "目標を入力してください。" }, { status: 400 });
  const last = await prisma.bizMonthGoal.findFirst({ where: { term, month: b.month }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const g = await prisma.bizMonthGoal.create({
    data: {
      term,
      month: b.month,
      dept: f.dept,
      goal: f.goal,
      kpi: f.kpi ?? null,
      target: f.target ?? null,
      actual: f.actual ?? null,
      ownerComment: f.ownerComment ?? null,
      ceoFb: f.ceoFb ?? null,
      status: f.status ?? null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  return Response.json(g, { status: 201 });
}
