import { NextRequest } from "next/server";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { parseFlamCollectionCsv, replaceFlamCollections } from "@/lib/flam-collection-server";

export const dynamic = "force-dynamic";

// POST /api/flam/collections  FLAM「回収予定」CSVをそのまま本文で送る。入っている回収月を丸ごと入れ替える
export async function POST(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (!v.isAccounting) return forbidden("回収予定の取り込みは社長・経理だけができます");
  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0) return Response.json({ error: "ファイルが空です" }, { status: 400 });
  let data;
  try {
    data = parseFlamCollectionCsv(buf);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "CSVを読めませんでした" }, { status: 400 });
  }
  return Response.json(await replaceFlamCollections(data));
}
