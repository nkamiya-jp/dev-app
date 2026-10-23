// アーティファクト「神谷商会 JAN台帳」の items（JSON書き出し）と DEV の JanItem を突き合わせる（読み取りのみ）
// 実行: npx tsx --env-file=.env scripts/compare_jan_artifact.mts <itemsのJSONディレクトリ> <結果CSVの出力先>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import { isValidEan13 } from "../src/lib/ean13";
import { toCsv } from "../src/lib/jan-ledger";

const [dir, out] = process.argv.slice(2);
const arts = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

const devItems = await prisma.janItem.findMany({ include: { product: { select: { code: true, name: true } } } });
const dev = new Map(devItems.map((x) => [x.jan, x]));
const prefixes = await prisma.janPrefix.findMany();

const norm = (s: unknown) => String(s ?? "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
const rows: (string | number | null)[][] = [["判定", "JAN", "アーティファクト:商品名", "カラー", "品番", "ブランド", "使用先", "GS1", "source", "DEV:状態", "DEV:商品名", "DEV:名称他", "DEV:柄コード", "DEV:過去Amazonコード"]];
const tally: Record<string, number> = {};

for (const a of arts.sort((x, y) => x.jan.localeCompare(y.jan))) {
  const d = dev.get(a.jan);
  // 過去Amazonコードとして DEV に載っているか
  const asPast = devItems.find((x) => x.pastAmazonCode === a.jan);
  let verdict: string;
  if (!isValidEan13(a.jan)) verdict = "CD不一致";
  else if (!d && asPast) verdict = "DEVでは過去Amazonコード";
  else if (!d) verdict = prefixes.some((p) => a.jan.startsWith(p.prefix)) ? "DEVに無い（事業者コードは登録済）" : "DEVに無い（事業者コード未登録）";
  else if (d.status !== "used") verdict = `DEVでは${d.status === "free" ? "空き" : "確保"}`;
  else {
    const an = norm(a.name);
    const dn = norm(`${d.productName ?? ""}${d.nameOther ?? ""}`);
    verdict = an && dn && (dn.includes(an.slice(0, 4)) || an.includes(norm(d.productName).slice(0, 4))) ? "一致（使用中）" : "使用中・名称が異なる";
  }
  tally[verdict] = (tally[verdict] || 0) + 1;
  rows.push([verdict, a.jan, a.name, a.color, a.sku, a.brand, a.channels, a.gs1 === "registered" ? "登録済" : "", a.source, d?.status ?? "", d?.productName ?? "", d?.nameOther ?? "", d?.patternCode ?? "", d?.pastAmazonCode ?? asPast?.jan ?? ""]);
}

writeFileSync(out, "﻿" + toCsv(rows));
console.log("artifact items:", arts.length, " DEV items:", devItems.length);
console.log(tally);
console.log("DEV prefixes:", prefixes.map((p) => p.prefix).join(", "));
