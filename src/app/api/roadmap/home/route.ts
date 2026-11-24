import { prisma } from "@/lib/db";
import { getViewer, unauthorized } from "@/lib/viewer";
import { getRoadmapSettings, todayJst } from "@/lib/roadmap/settings";
import { QUARTER_STYLE, achievement, goalForViewer, quarterOfMonth } from "@/lib/roadmap/goal-rules";
import { addDays } from "@/lib/roadmap/portal";
import { ensureStage3Tables } from "@/lib/roadmap/ensure-tables";

export const dynamic = "force-dynamic";

const UPCOMING_DAYS = 30; // 「これからの予定」に出す日数（推測：GAS版に合わせて調整）
const RECENT_POSTS = 5;

// GET /api/roadmap/home — ホームに出すものをまとめて返す
// 個人目標は本人の分だけ（社長評価・社長コメントは確定後のみ）。「社長のみ」の予定は社長にだけ。
// 売上の数字はここでは作らない（営業成績は段階5。パートには今後も返さない）
export async function GET() {
  const v = await getViewer();
  if (!v) return unauthorized();
  await ensureStage3Tables();
  const { term, raw } = await getRoadmapSettings();
  const today = todayJst();
  const month = today.slice(0, 7);
  const quarter = quarterOfMonth(month);
  const until = addDays(today, UPCOMING_DAYS);

  const [pinned, recent, events, bizGoals, monthGoals, myGoals] = await Promise.all([
    prisma.boardPost.findMany({ where: { pinned: true }, orderBy: { createdAt: "desc" } }),
    prisma.boardPost.findMany({ where: { pinned: false }, orderBy: { createdAt: "desc" }, take: RECENT_POSTS }),
    prisma.companyEvent.findMany({
      where: {
        ...(!v.isPresident && { visibility: "全員" }),
        startDate: { lte: until },
        OR: [{ endDate: { gte: today } }, { endDate: null, startDate: { gte: today } }],
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      take: 12,
    }),
    prisma.bizGoal.findMany({
      where: { term, period: { in: ["年間", quarter] } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, period: true, goal: true, kpi: true, target: true, actual: true, owner: true, status: true },
    }),
    prisma.bizMonthGoal.findMany({
      where: { term, month },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, dept: true, goal: true, target: true, actual: true, status: true },
    }),
    v.memberId
      ? prisma.personalGoal.findMany({
          where: { memberId: v.memberId, term, OR: [{ kind: "四半期", quarter }, { kind: "月", month }] },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return Response.json({
    today,
    term,
    quarter,
    quarterLabel: QUARTER_STYLE[quarter]?.label ?? quarter,
    month,
    vision: raw["VISION"] || "",
    theme: raw["期のテーマ"] || "",
    viewer: { name: v.name, memberId: v.memberId, isPresident: v.isPresident, isPart: v.isPart },
    pinned,
    recent,
    events,
    bizGoals,
    monthGoals,
    myGoals: myGoals.map((g) => ({ ...goalForViewer(g, v.isPresident), achievement: achievement(g) })),
  });
}
