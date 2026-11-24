// FLAMの回収予定（請求先×伝票）と、その月の見出しのテーブルを作る。
// 使い方: node --env-file=.env scripts/add_flam_collection_tables.mjs
import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const has = async (t) => (await db.execute({ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?", args: [t] })).rows.length > 0;

if (!(await has("FlamCollection"))) {
  await db.execute(`
    CREATE TABLE "FlamCollection" (
      "month"        TEXT NOT NULL,
      "slipNo"       TEXT NOT NULL,
      "kind"         TEXT NOT NULL DEFAULT '請求',
      "customerCode" TEXT NOT NULL,
      "customerName" TEXT NOT NULL,
      "dueDate"      TEXT NOT NULL,
      "amount"       INTEGER NOT NULL DEFAULT 0,
      "received"     INTEGER NOT NULL DEFAULT 0,
      "method"       TEXT,
      "importedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("month", "slipNo", "customerCode")
    )`);
  await db.execute(`CREATE INDEX "FlamCollection_month_idx" ON "FlamCollection"("month")`);
  console.log("created FlamCollection");
} else console.log("skip: FlamCollection exists");

if (!(await has("FlamCollectionMonth"))) {
  await db.execute(`
    CREATE TABLE "FlamCollectionMonth" (
      "month"      TEXT NOT NULL PRIMARY KEY,
      "planned"    INTEGER NOT NULL DEFAULT 0,
      "carryover"  INTEGER NOT NULL DEFAULT 0,
      "total"      INTEGER NOT NULL DEFAULT 0,
      "received"   INTEGER NOT NULL DEFAULT 0,
      "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  console.log("created FlamCollectionMonth");
} else console.log("skip: FlamCollectionMonth exists");
