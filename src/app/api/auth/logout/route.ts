import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ログアウト：セッションCookieを消してログイン画面へ
function clear(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", request.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  return clear(request);
}

export async function POST(request: NextRequest) {
  return clear(request);
}
