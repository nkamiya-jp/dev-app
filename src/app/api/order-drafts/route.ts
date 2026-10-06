import { NextRequest, after } from "next/server";
import { prisma } from "@/lib/db";
import { addReaction, removeReaction } from "@/lib/slack";

export const dynamic = "force-dynamic";

// GET /api/order-drafts?status=pending — Slackから取り込んだ受注下書き（既定は確認待ちのみ）
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") || "pending";
  const drafts = await prisma.orderDraft.findMany({
    where: status === "all" ? {} : { status },
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
  const draft = await prisma.orderDraft.update({
    where: { id },
    data: { status, ...(orderId !== undefined && { orderId: orderId || null }) },
  });

  if (status === "registered" && draft.slackChannel && draft.slackTs) {
    const { slackChannel, slackTs } = draft;
    after(async () => {
      await addReaction(slackChannel, slackTs, "white_check_mark");
      await removeReaction(slackChannel, slackTs, "memo");
    });
  }
  return Response.json(draft);
}
