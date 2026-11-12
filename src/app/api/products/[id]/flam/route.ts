import { NextRequest } from "next/server";
import { setProductFlamCodes, FlamLinkError } from "@/lib/flam-server";

export const dynamic = "force-dynamic";

// PUT /api/products/[id]/flam { codes: string[] } - FLAMコードを置き換え、顧客別単価を補完
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { codes } = await request.json();
  try {
    return Response.json(await setProductFlamCodes(id, codes));
  } catch (e) {
    if (e instanceof FlamLinkError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
