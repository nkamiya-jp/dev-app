import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7日

// パスワードログイン（緊急用フォールバック）。通常はGoogleログインを使う。
export async function POST(request: NextRequest) {
  const { password } = await request.json();

  const correctPassword = process.env.AUTH_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  if (!correctPassword) {
    return Response.json({ error: "AUTH_PASSWORD が設定されていません" }, { status: 500 });
  }
  if (!secret) {
    return Response.json({ error: "AUTH_SECRET が設定されていません" }, { status: 500 });
  }
  if (password !== correctPassword) {
    return Response.json({ error: "パスワードが正しくありません" }, { status: 401 });
  }

  // 署名付きセッションを発行（ミドルウェアはこの署名付きCookieのみ信頼する）
  const token = await createSessionToken("password-login", SESSION_MAX_AGE, secret);
  const isProduction = process.env.NODE_ENV === "production";
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${isProduction ? "; Secure" : ""}`;

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}
