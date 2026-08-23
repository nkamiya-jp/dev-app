import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, decodeJwtPayload, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7日

// GET /api/auth/google/callback — Googleからの戻り。トークン交換→ドメイン確認→セッション発行
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const fail = (err: string) => NextResponse.redirect(new URL(`/login?error=${err}`, request.url));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = request.cookies.get("oauth_state")?.value;
  const fromCookie = request.cookies.get("oauth_from")?.value || "/deals";

  // CSRF対策：stateの一致を確認
  if (!code || !state || !storedState || state !== storedState) return fail("state");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const secret = process.env.AUTH_SECRET;
  if (!clientId || !clientSecret || !secret) return fail("not_configured");

  const redirectUri = `${url.origin}/api/auth/google/callback`;

  // 認可コード → トークン交換
  let idToken: string | undefined;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail("token");
    const tokenData = (await tokenRes.json()) as { id_token?: string };
    idToken = tokenData.id_token;
  } catch {
    return fail("token");
  }
  if (!idToken) return fail("token");

  // id_token を検証（aud/iss/exp）してメールを取得
  const payload = decodeJwtPayload(idToken);
  if (!payload) return fail("token");
  if (payload.aud !== clientId) return fail("token");
  const iss = payload.iss;
  if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") return fail("token");
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) return fail("token");

  const email = String(payload.email || "").toLowerCase();
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  if (!email || !emailVerified) return fail("not_allowed");

  // 許可判定：会社ドメイン or 個別許可リスト
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || "kamiya-craft.com").toLowerCase();
  const allowlist = (process.env.ALLOWED_EMAILS || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const emailDomain = email.split("@")[1] || "";
  const allowed = (!!domain && emailDomain === domain) || allowlist.includes(email);
  if (!allowed) return fail("not_allowed");

  // セッション発行
  const token = await createSessionToken(email, SESSION_MAX_AGE, secret);
  const dest = fromCookie.startsWith("/") ? fromCookie : "/deals";
  const res = NextResponse.redirect(new URL(dest, request.url));
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  res.cookies.delete("oauth_state");
  res.cookies.delete("oauth_from");
  return res;
}
