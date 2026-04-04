import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/_next", "/icons", "/manifest.json", "/sw.js", "/offline"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公開パスはスルー
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // 静的ファイルはスルー
  if (pathname.includes(".")) {
    return NextResponse.next();
  }

  // 認証チェック
  const authCookie = request.cookies.get("dev-auth");
  if (authCookie?.value === "authenticated") {
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
