// FLAMの売上集計（得意先×月×商品）と、月ごとの売上目標のテーブルを作る。
// 使い方: node --env-file=.env scripts/add_flam_sales_tables.mjs
import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const has = async (t) => (await db.execute({ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?", args: [t] })).rows.length > 0;

if (!(await has("FlamSale"))) {
  await db.execute(`
    CREATE TABLE "FlamSale" (
      "month"        TEXT NOT NULL,
      "customerCode" TEXT NOT NULL,
      "productCode"  TEXT NOT NULL,
      "spec"         TEXT NOT NULL DEFAULT '',
      "customerName" TEXT NOT NULL,
      "productName"  TEXT NOT NULL,
      "amount"       INTEGER NOT NULL DEFAULT 0,
      "qty"          INTEGER NOT NULL DEFAULT 0,
      "cost"         INTEGER NOT NULL DEFAULT 0,
      "importedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("month", "customerCode", "productCode", "spec")
    )`);
  await db.execute(`CREATE INDEX "FlamSale_month_idx" ON "FlamSale"("month")`);
  console.log("created FlamSale");
} else console.log("skip: FlamSale exists");

if (!(await has("SalesTarget"))) {
  await db.execute(`
    CREATE TABLE "SalesTarget" (
      "month"     TEXT NOT NULL PRIMARY KEY,
      "amount"    INTEGER NOT NULL DEFAULT 0,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  console.log("created SalesTarget");
} else console.log("skip: SalesTarget exists");
