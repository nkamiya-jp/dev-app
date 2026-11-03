import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { getRoadmapSettings, todayJst } from "@/lib/roadmap/settings";
import { GOAL_KINDS, goalForViewer, pickEditable, type GoalInput } from "@/lib/roadmap/goal-rules";
import { checkGoalLinks } from "@/lib/roadmap/goal-links";

export const dynamic = "force-dynamic";

// GET /api/roadmap/goals?memberId=<id>|*
// スタッフ・パートは自分の分だけ（他人のIDを指定したら403）。社長は誰でも／* で全員
export async function GET(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const { term, termStart } = await getRoadmapSettings();
  const req = request.nextUrl.searchParams.get("memberId");

  let memberFilter: { memberId?: string } = {};
  if (v.isPresident) {
    if (req && req !== "*") memberFilter = { memberId: req };
    else if (!req) memberFilter = { memberId: v.memberId ?? "-" };
  } else {
    if (!v.memberId) return forbidden();
    if (req && req !== v.memberId) return forbidden("他の人の目標は見られません");
    memberFilter = { memberId: v.memberId };
  }

  const [goals, bizGoals] = await Promise.all([
    prisma.personalGoal.findMany({ where: { term, ...memberFilter }, orderBy: { createdAt: "asc" } }),
    prisma.bizGoal.findMany({
      where: { term },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, grain: true, period: true, goal: true },
    }),
  ]);

  const out: Record<string, unknown> = {
    term,
    termStart,
    today: todayJst(),
    viewer: { memberId: v.memberId, name: v.name, isPresident: v.isPresident },
    goals: goals.map((g) => goalForViewer(g, v.isPresident)),
    bizGoals,
  };

  if (v.isPresident) {
    // 社長ページの名前ボタン：ログインできるメンバー（社長以外）と、年間・四半期目標の数
    const [members, counts] = await Promise.all([
      prisma.member.findMany({
        where: { permission: { in: ["staff", "part"] }, active: true, employment: { not: "退職" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true, permission: true, departments: true },
      }),
      prisma.personalGoal.groupBy({ by: ["memberId"], where: { term, kind: { not: "月" } }, _count: { _all: true } }),
    ]);
    out.members = members.map((m) => ({ ...m, goalCount: counts.find((c) => c.memberId === m.id)?._count._all ?? 0 }));
  }
  return Response.json(out);
}

// POST /api/roadmap/goals — 新規。body: { memberId?（社長のみ）, kind, quarter?, month?, ... }
export async function POST(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  const b = (await request.json()) as GoalInput & { memberId?: string };
  const { term } = await getRoadmapSettings();

  const memberId = v.isPresident ? b.memberId || v.memberId : v.memberId;
  if (!memberId) return Response.json({ error: "対象者を選んでください。" }, { status: 400 });
  if (!v.isPresident && b.memberId && b.memberId !== v.memberId) return forbidden("他の人の目標は作れません");

  const kind = (GOAL_KINDS as readonly string[]).includes(String(b.kind)) ? String(b.kind) : "四半期";
  const r = pickEditable(b, { isPresident: v.isPresident, kind, status: "設定中", isNew: true });
  if ("error" in r) return Response.json({ error: r.error }, { status: 400 });
  const d = r.data;
  if (!d.goal) return Response.json({ error: "目標を入力してください。" }, { status: 400 });
  if (kind === "月" && !d.month) return Response.json({ error: "月を選んでください。" }, { status: 400 });
  if (kind === "四半期" && !d.quarter) return Response.json({ error: "四半期を選んでください。" }, { status: 400 });
  const check = await checkGoalLinks(d, memberId);
  if (check) return Response.json({ error: check }, { status: 400 });

  const goal = await prisma.personalGoal.create({
    data: {
      memberId,
      term,
      kind,
      quarter: kind === "年間" ? null : d.quarter ?? null,
      month: kind === "月" ? d.month ?? null : null,
      parentId: d.parentId ?? null,
      bizGoalId: kind === "四半期" ? d.bizGoalId ?? null : null,
      qtype: d.qtype || "定量",
      goal: d.goal,
      criteria: d.criteria ?? null,
      kpi: d.kpi ?? null,
      target: d.target ?? null,
      result: d.result ?? null,
      progress: d.progress ?? null,
      weight: kind === "四半期" ? (d.weight as number | null) ?? null : null,
      selfComment: d.selfComment ?? null,
      fb: d.fb ?? null,
      status: v.isPresident && d.status ? d.status : "設定中",
    },
  });
  return Response.json(goalForViewer(goal, v.isPresident), { status: 201 });
}
