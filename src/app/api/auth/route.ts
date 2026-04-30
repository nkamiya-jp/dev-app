import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  const correctPassword = process.env.AUTH_PASSWORD;

  if (!correctPassword) {
    return Response.json(
      { error: "AUTH_PASSWORD が設定されていません" },
      { status: 500 }
    );
  }

  if (password !== correctPassword) {
    return Response.json(
      { error: "パスワードが正しくありません" },
      { status: 401 }
    );
  }

  const response = Response.json({ success: true });

  // 7日間有効なCookieを設定
  const isProduction = process.env.NODE_ENV === "production";
  const cookie = `dev-auth=authenticated; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${isProduction ? "; Secure" : ""}`;

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
    },
  });
}
