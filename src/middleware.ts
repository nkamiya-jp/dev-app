import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE, isAuthConfigured } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/version", "/_next", "/icons", "/manifest.json", "/sw.js", "/offline"];

export async function middleware(request: NextRequest) {
  // Googleログインの設定(環境変数)が揃うまでは認証OFF。デプロイしてもロックアウトしない。
  if (!isAuthConfigured()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // 公開パスはスルー
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // 静的ファイルはスルー
  if (pathname.includes(".")) {
    return NextResponse.next();
  }

  // 署名付きセッションCookieを検証
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token, process.env.AUTH_SECRET);
  if (session) {
    return NextResponse.next();
  }

  // 未認証 → ログインページへ
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
