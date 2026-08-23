import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/auth/google — Googleの認可画面へリダイレクト（ログイン開始）
export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/login?error=not_configured", request.url));
  }

  const from = request.nextUrl.searchParams.get("from") || "/deals";
  const state = crypto.randomUUID();
  const redirectUri = `${request.nextUrl.origin}/api/auth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("access_type", "online");
  authUrl.searchParams.set("prompt", "select_account");
  // 会社ドメインをヒントに（最終判定はコールバック側で厳密に行う）
  const hd = process.env.ALLOWED_EMAIL_DOMAIN || "kamiya-craft.com";
  if (hd) authUrl.searchParams.set("hd", hd);
  authUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authUrl);
  const secure = process.env.NODE_ENV === "production";
  const opts = { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 600 };
  res.cookies.set("oauth_state", state, opts);
  res.cookies.set("oauth_from", from, opts);
  return res;
}
