// 月の収支計画：顧客ごとの見込み・攻めの数、商品ごとの生産数、カテゴリごとの攻めの予算
// 旧「販売計画」（SalesPlan / SalesPlanCell）は使わなくなったので消す（空であることを確認済み）
// 実行: node --env-file=.env scripts/add_monthly_plan.mjs
import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

for (const t of ["SalesPlanCell", "SalesPlan"]) {
  const exists = (await db.execute({ sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, args: [t] })).rows.length;
  if (!exists) continue;
  const n = Number((await db.execute(`SELECT COUNT(*) AS n FROM "${t}"`)).rows[0].n);
  if (n > 0) throw new Error(`${t} に ${n} 行あるので消しません`);
  await db.execute(`DROP TABLE "${t}"`);
  console.log("dropped:", t);
}

// kind: forecast（見込み：今見えている分）| push（攻め：不足を埋めに行く分）
await db.execute(`CREATE TABLE IF NOT EXISTS "CustomerForecast" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contactId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'forecast',
  "qty" INTEGER NOT NULL DEFAULT 0,
  "updatedBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerForecast_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomerForecast_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);
await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "CustomerForecast_contactId_productId_month_kind_key" ON "CustomerForecast"("contactId", "productId", "month", "kind")`);
await db.execute(`CREATE INDEX IF NOT EXISTS "CustomerForecast_month_idx" ON "CustomerForecast"("month")`);

// 生産の予定（今は手入力。後で生産計画から読む）
await db.execute(`CREATE TABLE IF NOT EXISTS "MonthlyProduction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyProduction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);
await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyProduction_productId_month_key" ON "MonthlyProduction"("productId", "month")`);

// 不足を埋めるために、カテゴリへ振り分けた攻めの予算（売上）
await db.execute(`CREATE TABLE IF NOT EXISTS "MonthlyChannelBudget" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "month" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyChannelBudget_month_channel_key" ON "MonthlyChannelBudget"("month", "channel")`);
console.log("tables ready: CustomerForecast, MonthlyProduction, MonthlyChannelBudget");
