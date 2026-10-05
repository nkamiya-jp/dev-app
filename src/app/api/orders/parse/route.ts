import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseOrderText, OrderParseError } from "@/lib/order-parse";

export const dynamic = "force-dynamic";

// POST /api/orders/parse  { text, clarifications? } → 受注の下書き（登録はしない。画面で確認してから登録する）
// clarifications: 担当者からAIへの補足（「朱印帳のことです」など）。投稿より優先して読み直す。
export async function POST(request: NextRequest) {
  const { text, clarifications } = await request.json();
  if (!text || typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "投稿の文章を貼り付けてください" }, { status: 400 });
  }
  try {
    const clar = Array.isArray(clarifications) ? clarifications.filter((c: unknown) => typeof c === "string") : [];
    const draft = await parseOrderText(text.trim(), clar);
    return Response.json(draft);
  } catch (e) {
    if (e instanceof OrderParseError) {
      return Response.json({ error: e.message }, { status: 422 });
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "AIのキーが無効です。設定を確認してください" }, { status: 502 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "AIが混み合っています。少し待って再度お試しください" }, { status: 503 });
    }
    if (e instanceof Anthropic.APIError) {
      return Response.json(
        { error: `AIの呼び出しに失敗しました（${e.status ?? "通信エラー"}）。手入力で登録してください` },
        { status: 502 }
      );
    }
    throw e;
  }
}
