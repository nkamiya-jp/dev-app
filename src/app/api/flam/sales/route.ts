import { NextRequest } from "next/server";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { getSalesGoalSummary, parseFlamSalesCsv, replaceFlamSales } from "@/lib/flam-sales-server";

export const dynamic = "force-dynamic";

// GET /api/flam/sales  売上目標と実績（今期の月別）。売上の数字はパートには送らない
export async function GET() {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (v.isPart) return forbidden("売上の数字は表示できません");
  return Response.json(await getSalesGoalSummary());
}

// POST /api/flam/sales  FLAM「売上集計」CSVをそのまま本文で送る。入っている月を丸ごと入れ替える
export async function POST(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (!v.isAccounting) return forbidden("売上の取り込みは社長・経理だけができます");
  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0) return Response.json({ error: "ファイルが空です" }, { status: 400 });
  let rows;
  try {
    rows = parseFlamSalesCsv(buf);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "CSVを読めませんでした" }, { status: 400 });
  }
  return Response.json(await replaceFlamSales(rows));
}
