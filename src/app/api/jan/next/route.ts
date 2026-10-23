import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildJan } from "@/lib/ean13";
import { JAN_TAKEN_STATUSES } from "@/lib/jan-ledger";

export const dynamic = "force-dynamic";

// GET /api/jan/next?prefix=457008967&from=120&count=10
// 指定した品目コード「以降」で、使用中・廃番でない番号を探す（空き・確保・台帳未登録）。
// 範囲は事業者コードの設定（rangeStart〜rangeEnd）。過去にAmazonで使われた番号は除外。
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const prefix = sp.get("prefix") || "";
  const count = Math.min(50, Math.max(1, Number(sp.get("count")) || 10));

  const setting = await prisma.janPrefix.findUnique({ where: { prefix } });
  if (!setting) return Response.json({ error: "事業者コードが登録されていません" }, { status: 404 });
  if (!setting.active) return Response.json({ error: "この事業者コードは採番に使わない設定です（設定で有効にできます）" }, { status: 400 });

  const from = Math.max(setting.rangeStart, Number(sp.get("from")) || setting.rangeStart);
  const existing = await prisma.janItem.findMany({
    where: { companyPrefix: prefix, itemCode: { gte: from, lte: setting.rangeEnd } },
    select: { itemCode: true, status: true, patternCode: true, nameOther: true },
  });
  const byCode = new Map(existing.map((e) => [e.itemCode, e]));
  const pastCodes = new Set(
    (await prisma.janItem.findMany({ where: { pastAmazonCode: { startsWith: prefix } }, select: { pastAmazonCode: true } }))
      .map((x) => x.pastAmazonCode)
  );

  const candidates: { jan: string; itemCode: number; state: "free" | "reserved" | "new"; memo: string | null }[] = [];
  for (let code = from; code <= setting.rangeEnd && candidates.length < count; code++) {
    const e = byCode.get(code);
    if (e && JAN_TAKEN_STATUSES.includes(e.status)) continue;
    const jan = buildJan(prefix, code);
    if (pastCodes.has(jan)) continue;
    candidates.push({
      jan,
      itemCode: code,
      state: e ? (e.status as "free" | "reserved") : "new",
      memo: e ? e.patternCode || e.nameOther || null : null,
    });
  }
  return Response.json({ prefix, from, rangeEnd: setting.rangeEnd, candidates });
}
