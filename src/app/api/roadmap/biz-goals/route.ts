import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { getRoadmapSettings, todayJst } from "@/lib/roadmap/settings";
import { achievement, fiscalMonths } from "@/lib/roadmap/goal-rules";
import { BIZ_PERIODS, canEditBizOwner, canEditDept, pickFields } from "@/lib/roadmap/portal";

export const dynamic = "force-dynamic";

// GET /api/roadmap/biz-goals — 今期の事業目標（年間・四半期）・事業別の月目標と、ひも付いた個人目標の進み具合
// スタッフ・パートには人数と平均達成率だけ。誰が何を書いたか（個人目標の中身）は社長にだけ返す
export async function GET() {
  const v = await getViewer();
  if (!v) return unauthorized();
  const { term, termStart, departments } = await getRoadmapSettings();

  const [goals, monthGoals] = await Promise.all([
    prisma.bizGoal.findMany({
      where: { term },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        personalGoals: {
          where: { kind: "四半期" },
          select: {
            id: true, goal: true, qtype: true, target: true, result: true, status: true, weight: true,
            member: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.bizMonthGoal.findMany({ where: { term }, orderBy: [{ month: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);

  return Response.json({
    term,
    termStart,
    today: todayJst(),
    months: fiscalMonths(termStart).map((m) => m.key),
    departments,
    viewer: { name: v.name, isPresident: v.isPresident, departments: v.departments },
    goals: goals.map(({ personalGoals, ...g }) => {
      const rates = personalGoals.map(achievement).filter((x): x is number => x !== null);
      const support = {
        people: new Set(personalGoals.map((p) => p.member.id)).size,
        milestones: personalGoals.length,
        avgAchievement: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null,
      };
      return {
        ...g,
        support,
        canEdit: canEditBizOwner(v, g.owner),
        ...(v.isPresident && {
          supporters: personalGoals.map((p) => ({
            id: p.id,
            memberId: p.member.id,
            memberName: p.member.name,
            goal: p.goal,
            status: p.status,
            weight: p.weight,
            achievement: achievement(p),
          })),
        }),
      };
    }),
    monthGoals: monthGoals.map((m) => ({ ...m, canEdit: canEditDept(v, m.dept) })),
  });
}

// POST /api/roadmap/biz-goals — 事業目標の追加（社長のみ）
export async function POST(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (!v.isPresident) return forbidden("事業目標を追加できるのは社長だけです");
  const b = await request.json();
  const { term } = await getRoadmapSettings();
  const period = (BIZ_PERIODS as readonly string[]).includes(String(b.period)) ? String(b.period) : "年間";
  const f = pickFields(b, ["goal", "kpi", "target", "actual", "owner", "status", "comment"] as const);
  if (!f.goal) return Response.json({ error: "目標を入力してください。" }, { status: 400 });
  const last = await prisma.bizGoal.findFirst({ where: { term }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const g = await prisma.bizGoal.create({
    data: {
      term,
      period,
      grain: period === "年間" ? "年間" : "四半期",
      goal: f.goal,
      kpi: f.kpi ?? null,
      target: f.target ?? null,
      actual: f.actual ?? null,
      owner: f.owner ?? null,
      status: f.status ?? null,
      comment: f.comment ?? null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  return Response.json(g, { status: 201 });
}
