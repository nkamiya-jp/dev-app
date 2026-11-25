// 受注明細に並び順の列を追加する（何度実行しても安全）
// 実行: node --env-file=.env scripts/add_orderitem_sortorder.mjs
import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const cols = (await db.execute(`PRAGMA table_info("OrderItem")`)).rows.map((c) => c.name);
if (cols.includes("sortOrder")) {
  console.log("OrderItem.sortOrder は既にあります（変更なし）");
} else {
  await db.execute(`ALTER TABLE "OrderItem" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0`);
  console.log("OrderItem.sortOrder を追加しました");
}
const n = (await db.execute(`SELECT COUNT(*) AS n FROM "OrderItem"`)).rows[0].n;
console.log(`明細 ${n} 件（既存の明細は並び順0＝これまでどおり作成順で並びます）`);
