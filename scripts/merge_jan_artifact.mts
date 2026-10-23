// アーティファクト「神谷商会 JAN台帳」で使用中（GS1登録・顧客・Amazon JP/US）の JAN を DEV の台帳に「使用中」として反映する。
// 追加のみ：DEVで使用中の行は書き換えない（食い違いは一覧に出すだけ）。空き・確保の行と、DEVに無い番号だけを使用中にする。
// 実行: npx tsx --env-file=.env scripts/merge_jan_artifact.mts <itemsのJSONディレクトリ> <バックアップ出力先.json> [--apply]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import { isValidEan13, splitJan } from "../src/lib/ean13";

const [dir, backupPath, flag] = process.argv.slice(2);
const apply = flag === "--apply";

interface ArtItem { jan: string; name?: string; color?: string; sku?: string; brand?: string; channels?: string; note?: string; gs1?: string; source?: string }
const arts: ArtItem[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

const prefixes = await prisma.janPrefix.findMany();
const existing = await prisma.janItem.findMany({ where: { jan: { in: arts.map((a) => a.jan) } } });
const byJan = new Map(existing.map((x) => [x.jan, x]));

// 台帳の事業者コード（9桁・10桁）で分ける。登録の無いものは先頭9桁を事業者コード扱い（他社コード）
function prefixOf(jan: string) {
  const p = prefixes.find((x) => jan.startsWith(x.prefix));
  if (p) return p.prefix;
  if (jan.startsWith("0")) return jan.slice(0, 10); // GS1 US の UPC（先頭0＋10桁）
  return jan.slice(0, 9);
}

function noteFor(a: ArtItem) {
  const parts = ["アーティファクト台帳より"];
  if (a.gs1 === "registered") parts.push("GS1(GJDB)登録済");
  if (a.channels) parts.push(`使用先: ${a.channels}`);
  if (a.brand) parts.push(`ブランド: ${a.brand}`);
  if (a.note) parts.push(a.note);
  return parts.join(" / ");
}

const toWrite: { a: ArtItem; prev: (typeof existing)[number] | undefined }[] = [];
for (const a of arts) {
  if (!isValidEan13(a.jan)) continue;
  const d = byJan.get(a.jan);
  if (d && d.status === "used") continue;
  toWrite.push({ a, prev: d });
}

console.log(`対象 ${toWrite.length} 件（新規 ${toWrite.filter((x) => !x.prev).length}・空き/確保→使用中 ${toWrite.filter((x) => x.prev).length}）`);
for (const { a, prev } of toWrite) console.log(" ", prev ? `${prev.status}→used` : "new      ", a.jan, a.name, a.color ?? "");

writeFileSync(backupPath, JSON.stringify(toWrite.filter((x) => x.prev).map((x) => x.prev), null, 2));
console.log("バックアップ（書き換える既存行）:", backupPath);

if (!apply) {
  console.log("--apply を付けると書き込みます");
  process.exit(0);
}

for (const { a, prev } of toWrite) {
  const data = {
    status: "used",
    productName: a.name || null,
    patternCode: a.color || null,
    nameOther: a.sku || null,
    amazonListed: /Amazon JP/.test(a.channels || ""),
    note: [prev?.note, noteFor(a)].filter(Boolean).join(" / "),
  };
  if (prev) {
    await prisma.janItem.update({ where: { id: prev.id }, data });
  } else {
    const companyPrefix = prefixOf(a.jan);
    const { itemCode } = splitJan(a.jan, companyPrefix.length);
    await prisma.janItem.create({ data: { jan: a.jan, companyPrefix, itemCode, ...data } });
  }
}
console.log("書き込み完了:", toWrite.length);
