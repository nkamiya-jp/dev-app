import { NextRequest } from "next/server";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { getChannelCosts, saveChannelCosts } from "@/lib/sales-plan-server";

export const dynamic = "force-dynamic";

// GET/PUT /api/sales-plans/channel-costs — 顧客カテゴリごとの販売コスト { [カテゴリ]: { pct, perUnit } }
// 例：AmazonJP＝手数料・広告で％＋FBA配送料を1個あたり。後で Seller Central の実データで更新する
export async function GET() {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (v.isPart) return forbidden("売上の数字は表示できません");
  return Response.json(await getChannelCosts());
}

export async function PUT(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (v.isPart) return forbidden("売上の数字は表示できません");
  return Response.json(await saveChannelCosts(await request.json()));
}
