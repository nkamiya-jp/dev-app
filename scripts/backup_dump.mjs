// 本番 Turso DB を丸ごと SQL テキスト（sqlite3 の .dump 相当）に書き出す。
// 使い方: node --env-file=.env scripts/backup_dump.mjs <出力.sql> [<行数.json>]
//   - 出力 .sql は `sqlite3 new.db < 出力.sql` や `turso db create <名前> --from-dump 出力.sql` で復元できる。
//   - 行数 .json は検証用（テーブルごとの件数）。GitHub Actions のログは公開なので件数は表示しない。
// 読み取りしかしない（SELECT と PRAGMA のみ）。読み取り専用トークンで動く。
import { createClient } from "@libsql/client";
import { createWriteStream, writeFileSync } from "node:fs";

const [out, countsOut] = process.argv.slice(2);
if (!out) {
  console.error("usage: backup_dump.mjs <out.sql> [<counts.json>]");
  process.exit(2);
}
const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("TURSO_DATABASE_URL が未設定です");
  process.exit(2);
}
// 大きな整数を丸めないよう bigint で受け取る。
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: "bigint" });

const PAGE = 500;
// Turso / libSQL が内部で作るテーブルは復元先で邪魔になるので除外する。
const SKIP = new Set(["libsql_wasm_func_table", "_litestream_seq", "_litestream_lock", "_cf_KV"]);

const qid = (name) => `"${String(name).replace(/"/g, '""')}"`;

function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") {
    // intMode=bigint なので number は必ず REAL。整数値でも REAL のまま戻るよう小数点を付ける。
    if (Number.isFinite(v)) {
      const s = String(v);
      return /[.eE]/.test(s) ? s : `${s}.0`;
    }
    return v > 0 ? "9e999" : v < 0 ? "-9e999" : "NULL";
  }
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof ArrayBuffer) return `X'${Buffer.from(v).toString("hex")}'`;
  if (ArrayBuffer.isView(v)) return `X'${Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("hex")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

const stream = createWriteStream(out, { encoding: "utf8" });
const write = (s) =>
  new Promise((resolve, reject) => {
    if (stream.write(s)) resolve();
    else stream.once("drain", resolve).once("error", reject);
  });

const schema = (
  await db.execute(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, rowid",
  )
).rows;

const tables = schema.filter(
  (r) => r.type === "table" && !String(r.name).startsWith("sqlite_") && !SKIP.has(r.name),
);
const others = schema.filter(
  (r) => r.type !== "table" && !String(r.name).startsWith("sqlite_") && !SKIP.has(r.tbl_name),
);

await write(`-- dev-app backup ${new Date().toISOString()}\nPRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n`);

const counts = {};
for (const t of tables) {
  const name = t.name;
  await write(`${t.sql};\n`);
  const info = (await db.execute(`PRAGMA table_info(${qid(name)})`)).rows;
  const cols = info.map((c) => c.name);
  const colList = cols.map(qid).join(",");
  const pk = info
    .filter((c) => Number(c.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((c) => qid(c.name));
  // 安定した順序でページングする（rowid を持たないテーブルは主キー順）。
  let order = "rowid";
  try {
    await db.execute(`SELECT rowid FROM ${qid(name)} LIMIT 0`);
  } catch {
    order = pk.length ? pk.join(",") : colList;
  }
  let n = 0;
  for (let offset = 0; ; offset += PAGE) {
    const rs = await db.execute(
      `SELECT ${colList} FROM ${qid(name)} ORDER BY ${order} LIMIT ${PAGE} OFFSET ${offset}`,
    );
    for (const row of rs.rows) {
      const vals = cols.map((c) => lit(row[c]));
      await write(`INSERT INTO ${qid(name)}(${colList}) VALUES(${vals.join(",")});\n`);
    }
    n += rs.rows.length;
    if (rs.rows.length < PAGE) break;
  }
  counts[name] = n;
}

// AUTOINCREMENT の採番位置も復元する（sqlite3 .dump と同じやり方）。
const hasSeq = schema.some((r) => r.name === "sqlite_sequence");
if (hasSeq) {
  const seq = (await db.execute("SELECT name, seq FROM sqlite_sequence")).rows.filter((r) => !SKIP.has(r.name));
  if (seq.length) {
    await write("DELETE FROM sqlite_sequence;\n");
    for (const r of seq) await write(`INSERT INTO sqlite_sequence(name,seq) VALUES(${lit(r.name)},${lit(r.seq)});\n`);
  }
}

for (const o of others) await write(`${o.sql};\n`);
await write("COMMIT;\n");
await new Promise((resolve, reject) => stream.end((err) => (err ? reject(err) : resolve())));

if (countsOut) writeFileSync(countsOut, JSON.stringify(counts));
console.log(`OK: ${tables.length} tables, ${others.length} indexes/views/triggers`);
