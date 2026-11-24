// FLAMの回収予定CSV（売上 › 回収予定 › ダウンロード › CSV）を本番DBに取り込む。回収月ごとに丸ごと入れ替える。
// 画面の取り込みボタン（/cashflow）と同じ処理。手元のファイルをまとめて入れたいとき用。
// 使い方: node --env-file=.env scripts/import_flam_collections.mjs ~/Downloads/collect_daily*.csv
import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

function parseCsv(text) {
  const rows = []; let row = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = ""; if (row.some((x) => x !== "")) rows.push(row); row = [];
    } else cur += c;
  }
  row.push(cur); if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

const num = (v) => Math.round(Number(String(v ?? "").replace(/,/g, "")) || 0);

for (const file of process.argv.slice(2)) {
  const bytes = readFileSync(file);
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const table = parseCsv(new TextDecoder(bom ? "utf-8" : "shift_jis").decode(bytes).replace(/^﻿/, ""));
  const head = table[0].map((h) => h.trim());
  const get = (r, n) => (head.indexOf(n) >= 0 ? (r[head.indexOf(n)] ?? "").trim() : "");
  if (!head.includes("請求先回収予定額")) { console.log(`skip（回収予定のCSVではない）: ${file}`); continue; }
  const heads = new Map(); const rows = new Map();
  for (const r of table.slice(1)) {
    const m = /^(\d{4})\D+(\d{1,2})/.exec(get(r, "回収年月"));
    if (!m) continue;
    const month = `${m[1]}-${m[2].padStart(2, "0")}`;
    if (!heads.has(month)) heads.set(month, [month, num(get(r, "当月回収予定額")), num(get(r, "前月までの回収予定額")), num(get(r, "回収予定額合計")), num(get(r, "当月入金額"))]);
    const code = get(r, "請求先コード");
    if (!code) continue;
    const due = get(r, "回収予定日").replace(/\//g, "-");
    const slip = get(r, "伝票No") || `${code}-${due}`;
    const key = `${month}|${slip}|${code}`;
    const prev = rows.get(key);
    if (prev) { prev[6] += num(get(r, "請求先回収予定額")); prev[7] += num(get(r, "請求先入金額")); continue; }
    rows.set(key, [month, slip, get(r, "明細分類") || "請求", code, get(r, "請求先名"), due, num(get(r, "請求先回収予定額")), num(get(r, "請求先入金額")), get(r, "回収方法") || null]);
  }
  for (const h of heads.values()) {
    const list = [...rows.values()].filter((r) => r[0] === h[0]);
    await db.execute({ sql: `DELETE FROM "FlamCollection" WHERE "month" = ?`, args: [h[0]] });
    for (let i = 0; i < list.length; i += 50) {
      await db.batch(list.slice(i, i + 50).map((r) => ({
        sql: `INSERT INTO "FlamCollection" ("month","slipNo","kind","customerCode","customerName","dueDate","amount","received","method") VALUES (?,?,?,?,?,?,?,?,?)`,
        args: r,
      })), "write");
    }
    await db.execute({
      sql: `INSERT INTO "FlamCollectionMonth" ("month","planned","carryover","total","received","importedAt") VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT("month") DO UPDATE SET "planned"=excluded."planned","carryover"=excluded."carryover","total"=excluded."total","received"=excluded."received","importedAt"=CURRENT_TIMESTAMP`,
      args: h,
    });
    const inv = list.filter((r) => r[2] !== "入金").reduce((s, r) => s + r[6], 0);
    const rec = list.reduce((s, r) => s + r[7], 0);
    console.log(`${h[0]}: ${list.length}行 請求${inv.toLocaleString()}円 入金${rec.toLocaleString()}円 （${file}）`);
  }
}
