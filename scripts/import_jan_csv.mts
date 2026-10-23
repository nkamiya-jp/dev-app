// 旧JAN台帳のCSV（Shift_JIS / UTF-8）を JanItem に取り込む。JANキーで upsert（何度流しても同じ結果）。
// 使い方: npx tsx --env-file=.env scripts/import_jan_csv.mts <CSVのパス> [--dry-run]
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { isValidEan13 } from "../src/lib/ean13";
import { inferJanStatus, mapCsvRecord, parseCsv } from "../src/lib/jan-ledger";

const path = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!path) {
  console.error("CSVのパスを指定してください");
  process.exit(1);
}

const buf = readFileSync(path);
// UTF-8 として読めなければ Shift_JIS（旧台帳の書き出し）
let text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
if (text.includes("�")) text = new TextDecoder("shift_jis").decode(buf);

const records = parseCsv(text).map(mapCsvRecord);
const bad: string[] = [];
const byJan = new Map<string, ReturnType<typeof mapCsvRecord>>();
for (const r of records) {
  if (!isValidEan13(r.jan)) {
    bad.push(`${r.legacyRecordNo ?? "-"}: "${r.jan}"（${r.productName || "商品名なし"}）`);
    continue;
  }
  byJan.set(r.jan, r); // 同じJANが複数あれば後の行を採用
}
const rows = [...byJan.values()];
console.log(`読込 ${records.length}行 → 有効 ${rows.length}件（重複JANの統合 ${records.length - bad.length - rows.length}件、無効 ${bad.length}件）`);
if (bad.length) console.log("無効なJAN（取り込まない）:\n  " + bad.join("\n  "));

const statusCount: Record<string, number> = {};
for (const r of rows) {
  const st = r.status ?? inferJanStatus(r);
  statusCount[st] = (statusCount[st] || 0) + 1;
}
console.log("状態:", statusCount);
if (dryRun) process.exit(0);

const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
const PREFIX_LEN = 9;
const CHUNK = 50;
let done = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const placeholders = chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").join(",");
  const args = chunk.flatMap((r) => [
    randomUUID().replace(/-/g, ""),
    r.jan,
    r.jan.slice(0, PREFIX_LEN),
    Number(r.jan.slice(PREFIX_LEN, 12)),
    r.status ?? inferJanStatus(r),
    r.productName,
    r.nameOther,
    r.patternCode,
    r.amazonListed ? 1 : 0,
    r.amazonComolife ? 1 : 0,
    r.pastAmazonListed ? 1 : 0,
    r.pastAmazonCode,
    r.legacyRecordNo,
  ]);
  // 商品マスタへのひも付け(productId)とメモ(note)はDEV側の情報なので上書きしない
  await db.execute({
    sql: `INSERT INTO "JanItem" ("id","jan","companyPrefix","itemCode","status","productName","nameOther","patternCode","amazonListed","amazonComolife","pastAmazonListed","pastAmazonCode","legacyRecordNo","createdAt","updatedAt")
          VALUES ${placeholders}
          ON CONFLICT("jan") DO UPDATE SET
            "status"=excluded."status", "productName"=excluded."productName", "nameOther"=excluded."nameOther",
            "patternCode"=excluded."patternCode", "amazonListed"=excluded."amazonListed", "amazonComolife"=excluded."amazonComolife",
            "pastAmazonListed"=excluded."pastAmazonListed", "pastAmazonCode"=excluded."pastAmazonCode",
            "legacyRecordNo"=excluded."legacyRecordNo", "updatedAt"=CURRENT_TIMESTAMP`,
    args,
  });
  done += chunk.length;
}
console.log(`upsert 完了: ${done}件`);

// 事業者コードの設定（未登録のものだけ作る）。採番の範囲は台帳に実在する品目コードの最小〜最大（GS1の登録内容に合わせて画面で調整）
const pr = await db.execute(
  `SELECT "companyPrefix" p, MIN("itemCode") lo, MAX("itemCode") hi, COUNT(*) n FROM "JanItem" GROUP BY "companyPrefix" ORDER BY p`
);
for (const x of pr.rows) {
  const r = await db.execute({
    sql: `INSERT INTO "JanPrefix" ("id","prefix","rangeStart","rangeEnd","active","createdAt","updatedAt")
          VALUES (?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT("prefix") DO NOTHING`,
    args: [randomUUID().replace(/-/g, ""), x.p, x.lo, x.hi],
  });
  console.log(`事業者コード ${x.p}: 台帳 ${x.n}件・品目 ${x.lo}〜${x.hi}${r.rowsAffected ? "（設定を作成）" : ""}`);
}
const total = await db.execute(`SELECT status, COUNT(*) n FROM "JanItem" GROUP BY status`);
console.log("DB上の件数:", Object.fromEntries(total.rows.map((x) => [x.status, x.n])));
