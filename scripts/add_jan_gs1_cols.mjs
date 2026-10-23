// JanItem に GS1(GJDB)登録・上代・ブランド・使用先 を追加（アーティファクト台帳にあった項目）
import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const cols = (await db.execute(`PRAGMA table_info("JanItem")`)).rows.map((r) => r.name);
const add = [
  ["gs1Registered", `BOOLEAN NOT NULL DEFAULT 0`],
  ["price", `INTEGER`],
  ["brand", `TEXT`],
  ["channels", `TEXT`],
];
for (const [name, type] of add) {
  if (cols.includes(name)) {
    console.log("exists:", name);
    continue;
  }
  await db.execute(`ALTER TABLE "JanItem" ADD COLUMN "${name}" ${type}`);
  console.log("added:", name);
}
