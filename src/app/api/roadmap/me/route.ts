import { getViewer, unauthorized } from "@/lib/viewer";

export const dynamic = "force-dynamic";

// GET /api/roadmap/me — ログイン中の人と、出してよいメニュー
export async function GET() {
  const v = await getViewer();
  if (!v) return unauthorized();
  return Response.json({
    memberId: v.memberId,
    name: v.name,
    permission: v.permission,
    departments: v.departments,
    isPresident: v.isPresident,
    isPart: v.isPart,
    isLeader: v.isLeader,
    can: {
      sales: !v.isPart, // 売上の数字（DEVの月次売上・ロードマップの営業成績）
      president: v.isPresident,
      editMembers: v.isPresident,
    },
  });
}
