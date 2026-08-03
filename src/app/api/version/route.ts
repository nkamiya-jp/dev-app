export const dynamic = "force-dynamic";

// 現在デプロイされているビルドIDを返す。
// クライアントは自分に埋め込まれたIDと比較し、違えば新デプロイと判断して再読込する。
export async function GET() {
  return Response.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" });
}
