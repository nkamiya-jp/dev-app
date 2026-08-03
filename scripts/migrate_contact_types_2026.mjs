// 取引タイプ再定義に伴う移行。
// 新しい8タイプ(contact-meta.ts)に含まれない type を持つ顧客を type=NULL(未設定)にする。
// 冪等: 何度実行しても許可リスト外のtypeを未設定化するだけ。
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// contact-meta.ts の CONTACT_TYPES と一致させること
const ALLOWED = new Set([
  "overseas_ref",
  "amazon_jp",
  "ref",
  "sd",
  "retail_outside_kyoto",
  "wholesale_outside_kyoto",
  "retail_kyoto",
  "wholesale_kyoto",
]);

const all = await db.execute(`SELECT id,name,type FROM "Contact"`);
const target = all.rows.filter((r) => r.type && !ALLOWED.has(r.type));
console.log("未設定にする対象:", target.length, "件");
console.log(target.map((r) => `  ${r.type}\t${r.name}`).join("\n"));

let n = 0;
for (const r of target) {
  await db.execute({
    sql: `UPDATE "Contact" SET type=NULL, updatedAt=? WHERE id=?`,
    args: [new Date().toISOString(), r.id],
  });
  n++;
}
console.log(`\n更新: ${n} 件 → type=NULL`);

const after = await db.execute(`SELECT type, COUNT(*) n FROM "Contact" GROUP BY type ORDER BY n DESC`);
console.log("\n=== 移行後のtype分布 ===");
console.log(after.rows.map((x) => `${x.type ?? "(未設定)"}\t${x.n}`).join("\n"));
