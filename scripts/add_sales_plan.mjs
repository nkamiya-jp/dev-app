// 販売計画シミュレーション：計画（商品×シナリオ）と、月ごとの生産数・販売数（カテゴリ別・顧客別）
// 実行: node --env-file=.env scripts/add_sales_plan.mjs
import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

await db.execute(`CREATE TABLE IF NOT EXISTS "SalesPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "note" TEXT,
  "createdBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS "SalesPlan_term_idx" ON "SalesPlan"("term")`);

// kind: production（生産。channel・contact は空）| sale（販売。channel＝顧客カテゴリ、contact＝顧客。顧客未定は空）
await db.execute(`CREATE TABLE IF NOT EXISTS "SalesPlanCell" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "channel" TEXT,
  "contactId" TEXT,
  "month" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SalesPlanCell_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SalesPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SalesPlanCell_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS "SalesPlanCell_planId_idx" ON "SalesPlanCell"("planId")`);
await db.execute(`CREATE INDEX IF NOT EXISTS "SalesPlanCell_contactId_idx" ON "SalesPlanCell"("contactId")`);
console.log("tables ready: SalesPlan, SalesPlanCell");

// 採用：顧客予算（全計画の合計）に入れるのは採用したシナリオだけ（同じ商品の別案を二重に数えない）
const cols = (await db.execute(`PRAGMA table_info("SalesPlan")`)).rows.map((r) => r.name);
if (!cols.includes("adopted")) {
  await db.execute(`ALTER TABLE "SalesPlan" ADD COLUMN "adopted" BOOLEAN NOT NULL DEFAULT 0`);
  console.log("added: SalesPlan.adopted");
}

// 期首の在庫：すでに作ってある在庫から始める（支払いは済んでいるので資金は出ていかない。粗利には原価を入れる）
const cols2 = (await db.execute(`PRAGMA table_info("SalesPlan")`)).rows.map((r) => r.name);
if (!cols2.includes("openingStock")) {
  await db.execute(`ALTER TABLE "SalesPlan" ADD COLUMN "openingStock" INTEGER NOT NULL DEFAULT 0`);
  console.log("added: SalesPlan.openingStock");
}
