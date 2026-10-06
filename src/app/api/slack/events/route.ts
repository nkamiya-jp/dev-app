import { NextRequest, after } from "next/server";
import { prisma } from "@/lib/db";
import {
  ORDER_CHANNEL_ID,
  addReaction,
  cleanSlackText,
  getSlackUserName,
  verifySlackSignature,
} from "@/lib/slack";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface SlackMessage {
  type: string;
  subtype?: string;
  channel?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  message?: SlackMessage; // message_changed
  deleted_ts?: string; // message_deleted
}

// 返信スレッド内の発言（受注ではない）か
const isThreadReply = (m: SlackMessage) => !!m.thread_ts && m.thread_ts !== m.ts;

// POST /api/slack/events — Slack Events API の受け口（#受注 の投稿を確認待ちの下書きとして保存）
// Slack には3秒以内に応答する必要があるため、保存だけ済ませて応答し、リアクション等は after() で行う。
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let payload: { type?: string; challenge?: string; event?: SlackMessage };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const secret = process.env.SLACK_SIGNING_SECRET;
  const signed = secret
    ? verifySlackSignature(
        rawBody,
        request.headers.get("x-slack-request-timestamp"),
        request.headers.get("x-slack-signature"),
        secret
      )
    : false;

  // Slackアプリ作成時のURL確認。署名用シークレットが未設定の段階でも通す（challengeを返すだけで情報は出さない）
  if (payload.type === "url_verification") {
    if (secret && !signed) return new Response("invalid signature", { status: 401 });
    return Response.json({ challenge: payload.challenge });
  }

  if (!secret) return new Response("not configured", { status: 503 });
  if (!signed) return new Response("invalid signature", { status: 401 });

  const ev = payload.event;
  if (payload.type !== "event_callback" || !ev || ev.type !== "message" || ev.channel !== ORDER_CHANNEL_ID) {
    return new Response("ok");
  }
  const channel = ev.channel;

  // 新しい投稿（ファイル付き投稿も含む）
  if (!ev.subtype || ev.subtype === "file_share") {
    if (ev.bot_id || !ev.ts || isThreadReply(ev)) return new Response("ok");
    const text = cleanSlackText(ev.text || "");
    if (!text) return new Response("ok");

    // 同じ投稿の再送（Slackのリトライ）でも重複しないよう slackTs で一意にする
    const existing = await prisma.orderDraft.findUnique({ where: { slackTs: ev.ts } });
    if (!existing) {
      await prisma.orderDraft.create({
        data: {
          source: "slack",
          slackChannel: channel,
          slackTs: ev.ts,
          slackUserId: ev.user || null,
          rawText: text,
          postedAt: new Date(Number(ev.ts) * 1000),
        },
      });
      const ts = ev.ts;
      const userId = ev.user;
      after(async () => {
        await addReaction(channel, ts, "memo"); // 取り込んだ印
        if (userId) {
          const name = await getSlackUserName(userId);
          if (name) await prisma.orderDraft.update({ where: { slackTs: ts }, data: { slackUserName: name } });
        }
      });
    }
    return new Response("ok");
  }

  // 投稿の編集：確認待ちの下書きなら内容を更新
  if (ev.subtype === "message_changed" && ev.message?.ts && !isThreadReply(ev.message)) {
    const text = cleanSlackText(ev.message.text || "");
    if (text) {
      await prisma.orderDraft.updateMany({
        where: { slackTs: ev.message.ts, status: "pending" },
        data: { rawText: text },
      });
    }
    return new Response("ok");
  }

  // 投稿の削除：確認待ちの下書きなら対象外にする
  if (ev.subtype === "message_deleted" && ev.deleted_ts) {
    await prisma.orderDraft.updateMany({
      where: { slackTs: ev.deleted_ts, status: "pending" },
      data: { status: "dismissed" },
    });
    return new Response("ok");
  }

  return new Response("ok");
}
