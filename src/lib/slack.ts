// Slack 連携（#受注 の自動取り込み）用のユーティリティ。
// 必要な環境変数: SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN（任意で SLACK_ORDER_CHANNEL_ID）
import { createHmac, timingSafeEqual } from "node:crypto";

// #受注 チャンネル（環境変数で上書き可）
export const ORDER_CHANNEL_ID = process.env.SLACK_ORDER_CHANNEL_ID || "C0A8QK72P36";

// Slack からのリクエストか署名で確認する（5分より古いものは再送攻撃として拒否）
export function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  secret: string
): boolean {
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false;
  const expected = "v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Slack 独特の書式（メンション・リンク・エスケープ）を読みやすい文字に戻す
export function cleanSlackText(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+\|([^>]+)>/g, "@$1")
    .replace(/<@[A-Z0-9]+>/g, "")
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<!(here|channel|everyone)>/g, "")
    .replace(/<(?:mailto:|https?:\/\/)[^|>]+\|([^>]+)>/g, "$1")
    .replace(/<((?:mailto:|https?:\/\/)[^>]+)>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

// 投稿の「1行目」（メンションだけの行は飛ばす）。顧客名は通常ここに書かれる
export function firstMeaningfulLine(rawSlackText: string): string {
  const withoutMentions = cleanSlackText(rawSlackText.replace(/<@[^>]+>/g, ""));
  const line = withoutMentions.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  return (line || "").replace(/[\s　]+/g, "");
}

// 1行目が「毎日注文の取引先」の名前・呼び名で始まっていれば、その取引先を返す。
// 本文の途中に出てくるだけ（「清水との兼ね合いで…」など）では一致させない。
export function matchDailyOrderContact<T extends { company: string | null; name: string; orderAliases: string | null }>(
  rawSlackText: string,
  dailyContacts: T[]
): T | null {
  const head = firstMeaningfulLine(rawSlackText);
  if (!head) return null;
  for (const c of dailyContacts) {
    const keys = [c.company, c.name, ...(c.orderAliases || "").split(/[,、，]/)]
      .map((k) => (k || "").replace(/[\s　]+/g, ""))
      .filter((k) => k.length > 0);
    if (keys.some((k) => head.startsWith(k))) return c;
  }
  return null;
}

async function slackPost(method: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// 投稿にリアクションを付ける／外す（失敗しても業務は止めない）
export async function addReaction(channel: string, ts: string, name: string) {
  await slackPost("reactions.add", { channel, timestamp: ts, name });
}
export async function removeReaction(channel: string, ts: string, name: string) {
  await slackPost("reactions.remove", { channel, timestamp: ts, name });
}

// 投稿者の表示名（取れなければ null）
export async function getSlackUserName(userId: string): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as {
      ok: boolean;
      user?: { real_name?: string; name?: string; profile?: { display_name?: string; real_name?: string } };
    };
    if (!data.ok || !data.user) return null;
    const u = data.user;
    return u.profile?.real_name || u.real_name || u.profile?.display_name || u.name || null;
  } catch {
    return null;
  }
}
