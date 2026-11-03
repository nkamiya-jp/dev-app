// 個人目標のひも付け先の確認（サーバー側専用）
import { prisma } from "@/lib/db";
import type { GoalInput } from "@/lib/roadmap/goal-rules";

// 親（月→四半期、四半期→年間）は同じ人の目標、事業目標は実在するものだけ
export async function checkGoalLinks(d: GoalInput, memberId: string): Promise<string | null> {
  if (d.parentId) {
    const p = await prisma.personalGoal.findUnique({ where: { id: d.parentId }, select: { memberId: true } });
    if (!p || p.memberId !== memberId) return "ひも付け先の目標が見つかりません。";
  }
  if (d.bizGoalId) {
    const bg = await prisma.bizGoal.findUnique({ where: { id: d.bizGoalId }, select: { id: true } });
    if (!bg) return "ひも付け先の事業目標が見つかりません。";
  }
  return null;
}
