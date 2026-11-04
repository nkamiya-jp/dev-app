import { NextRequest } from "next/server";
import { forbidden, getViewer, unauthorized } from "@/lib/viewer";
import { getOemSettings, saveOemSettings } from "@/lib/oem-server";

export const dynamic = "force-dynamic";

// GET /api/oem/settings — 倍率（標準・大口）・大口の数量・粗利率の下限
export async function GET() {
  return Response.json(await getOemSettings());
}

// PUT — 変更は社長のみ
export async function PUT(request: NextRequest) {
  const v = await getViewer();
  if (!v) return unauthorized();
  if (!v.isPresident) return forbidden("OEMの倍率は社長だけが変更できます");
  return Response.json(await saveOemSettings(await request.json()));
}
