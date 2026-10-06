import { NextRequest, after } from "next/server";
import { prisma } from "@/lib/db";
import { addReaction, removeReaction } from "@/lib/slack";

export const dynamic = "force-dynamic";

// GET /api/order-drafts?status=pending — Slackから取り込んだ受注下書き（既定は確認待ちのみ）
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") || "pending";
  // 自動除外は直近30日分だけ（一覧が増え続けないように）
  const since = new Date(Date.now() - 30 * 86400000);
  const drafts = await prisma.orderDraft.findMany({
    where: status === "all" ? {} : status === "excluded" ? { status, createdAt: { gte: since } } : { status },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return Response.json(drafts);
}

// PATCH /api/order-drafts { id, status: "registered" | "dismissed" | "pending", orderId? }
// 受注登録したら Slack の投稿に ✅ を付ける（📝 は外す）
export async function PATCH(request: NextRequest) {
  const { id, status, orderId } = await request.json();
  if (!id || !["registered", "dismissed", "pending"].includes(status)) {
    return Response.json({ error: "invalid params" }, { status: 400 });
  }
  const before = await prisma.orderDraft.findUnique({ where: { id }, select: { status: true } });
  const draft = await prisma.orderDraft.update({
    where: { id },
    data: {
      status,
      ...(status === "pending" && { excludedReason: null }),
      ...(orderId !== undefined && { orderId: orderId || null }),
    },
  });

  // 自動除外から確認待ちに戻したら、取り込んだ印の 📝 を付ける
  if (status === "pending" && before?.status === "excluded" && draft.slackChannel && draft.slackTs) {
    const { slackChannel, slackTs } = draft;
    after(async () => {
      await addReaction(slackChannel, slackTs, "memo");
    });
  }

  if (status === "registered" && draft.slackChannel && draft.slackTs) {
    const { slackChannel, slackTs } = draft;
    after(async () => {
      await addReaction(slackChannel, slackTs, "white_check_mark");
      await removeReaction(slackChannel, slackTs, "memo");
    });
  }
  return Response.json(draft);
}
