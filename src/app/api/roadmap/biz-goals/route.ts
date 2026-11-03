import { prisma } from "@/lib/db";
import { getViewer, unauthorized } from "@/lib/viewer";
import { getRoadmapSettings } from "@/lib/roadmap/settings";
import { achievement } from "@/lib/roadmap/goal-rules";

export const dynamic = "force-dynamic";

// GET /api/roadmap/biz-goals — 今期の事業目標（年間・四半期）と、ひも付いた個人目標の進み具合
// スタッフ・パートには人数と平均達成率だけ。誰が何を書いたか（個人目標の中身）は社長にだけ返す
export async function GET() {
  const v = await getViewer();
  if (!v) return unauthorized();
  const { term } = await getRoadmapSettings();

  const goals = await prisma.bizGoal.findMany({
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
  });

  return Response.json({
    term,
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
  });
}
