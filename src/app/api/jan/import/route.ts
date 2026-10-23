import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { isValidEan13 } from "@/lib/ean13";
import { inferJanStatus, mapCsvRecord } from "@/lib/jan-ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/jan/import { records: CSVの行(列名→値)の配列 }  ※画面から500行ずつ送る
// JANキーで upsert。チェックデジットが合わない行は取り込まない。
// 「商品マスタコード」列があれば商品マスタにひも付ける（無い場合は既存のひも付けを残す）。
export async function POST(request: NextRequest) {
  const { records } = await request.json();
  if (!Array.isArray(records)) return Response.json({ error: "records required" }, { status: 400 });
  if (records.length > 1000) return Response.json({ error: "1回の取込は1000行までです" }, { status: 400 });

  const invalid: string[] = [];
  const byJan = new Map<string, ReturnType<typeof mapCsvRecord>>();
  for (const rec of records) {
    const r = mapCsvRecord(rec);
    if (!isValidEan13(r.jan)) {
      invalid.push(r.jan || "(JANなし)");
      continue;
    }
    byJan.set(r.jan, r);
  }
  const rows = [...byJan.values()];

  const codes = [...new Set(rows.map((r) => r.productCode).filter((c): c is string => !!c))];
  const products = codes.length
    ? await prisma.product.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } })
    : [];
  const productByCode = new Map(products.map((p) => [p.code, p.id]));
  const unknownCodes = codes.filter((c) => !productByCode.has(c));

  // 既存JANの事業者コード（桁数）を尊重。無ければ9桁とみなす
  const prefixes = (await prisma.janPrefix.findMany({ select: { prefix: true } })).map((p) => p.prefix);
  const prefixOf = (jan: string) => prefixes.find((p) => jan.startsWith(p)) ?? jan.slice(0, 9);

  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").join(",");
    const args = chunk.flatMap((r) => {
      const prefix = prefixOf(r.jan);
      return [
        randomUUID().replace(/-/g, ""),
        r.jan,
        prefix,
        Number(r.jan.slice(prefix.length, 12)),
        r.status ?? inferJanStatus(r),
        r.productName,
        r.nameOther,
        r.patternCode,
        r.amazonListed ? 1 : 0,
        r.amazonComolife ? 1 : 0,
        r.pastAmazonListed ? 1 : 0,
        r.pastAmazonCode,
        r.legacyRecordNo,
        r.productCode ? productByCode.get(r.productCode) ?? null : null,
        r.note,
      ];
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "JanItem" ("id","jan","companyPrefix","itemCode","status","productName","nameOther","patternCode","amazonListed","amazonComolife","pastAmazonListed","pastAmazonCode","legacyRecordNo","productId","note","createdAt","updatedAt")
       VALUES ${placeholders}
       ON CONFLICT("jan") DO UPDATE SET
         "status"=excluded."status", "productName"=excluded."productName", "nameOther"=excluded."nameOther",
         "patternCode"=excluded."patternCode", "amazonListed"=excluded."amazonListed", "amazonComolife"=excluded."amazonComolife",
         "pastAmazonListed"=excluded."pastAmazonListed", "pastAmazonCode"=excluded."pastAmazonCode",
         "legacyRecordNo"=COALESCE(excluded."legacyRecordNo", "JanItem"."legacyRecordNo"),
         "productId"=COALESCE(excluded."productId", "JanItem"."productId"),
         "note"=COALESCE(excluded."note", "JanItem"."note"),
         "updatedAt"=CURRENT_TIMESTAMP`,
      ...args
    );
  }

  // 台帳に新しく現れた事業者コードは設定を作る（範囲は取り込んだ品目コードの最小〜最大）
  const newPrefixes = [...new Set(rows.map((r) => prefixOf(r.jan)))].filter((p) => !prefixes.includes(p));
  for (const p of newPrefixes) {
    const agg = await prisma.janItem.aggregate({ where: { companyPrefix: p }, _min: { itemCode: true }, _max: { itemCode: true } });
    await prisma.janPrefix.create({
      data: { prefix: p, rangeStart: agg._min.itemCode ?? 0, rangeEnd: agg._max.itemCode ?? 10 ** (12 - p.length) - 1 },
    });
  }

  return Response.json({ upserted: rows.length, invalid, unknownProductCodes: unknownCodes, newPrefixes });
}
