import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildJanWhere, janFilterFromParams } from "@/lib/jan-query";
import { getJanStatus, toCsv } from "@/lib/jan-ledger";

export const dynamic = "force-dynamic";

// GET /api/jan/export?（一覧と同じ絞り込み） → CSV（UTF-8・BOM付き。Excelでそのまま開ける）
// この列のまま「取込」に戻せる（JANキーで上書き）
export async function GET(request: NextRequest) {
  const where = buildJanWhere(janFilterFromParams(request.nextUrl.searchParams));
  const items = await prisma.janItem.findMany({
    where,
    orderBy: { jan: "asc" },
    include: { product: { select: { code: true, name: true } } },
  });
  const header = [
    "状態", "JANコード", "事業者コード", "品目コード", "商品名", "名称他", "柄コード",
    "商品マスタコード", "商品マスタ名", "GS1登録", "上代", "ブランド", "使用先", "Amazon[出品]", "Amazon[コモライフ]", "過去Amazon[出品]", "過去Amazonコード",
    "レコード番号", "メモ",
  ];
  const lines = items.map((x) => [
    getJanStatus(x.status).label,
    x.jan,
    x.companyPrefix,
    String(x.itemCode).padStart(12 - x.companyPrefix.length, "0"),
    x.productName,
    x.nameOther,
    x.patternCode,
    x.product?.code,
    x.product?.name,
    x.gs1Registered ? "登録済み" : "未登録",
    x.price,
    x.brand,
    x.channels,
    x.amazonListed ? "1" : "",
    x.amazonComolife ? "1" : "",
    x.pastAmazonListed ? "1" : "",
    x.pastAmazonCode,
    x.legacyRecordNo,
    x.note,
  ]);
  const csv = "﻿" + toCsv([header, ...lines]);
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).replace(/[-: ]/g, "").slice(0, 12);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`JAN台帳_${stamp}.csv`)}`,
    },
  });
}
