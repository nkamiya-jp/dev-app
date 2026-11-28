// 毎月の定番の予想数（顧客×商品）のテーブルを作る。何度実行しても安全（IF NOT EXISTS）
// 実行: node --env-file=.env scripts/create_recurring_forecast.mjs
import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

await db.execute(`CREATE TABLE IF NOT EXISTS "RecurringForecast" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contactId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 0,
  "startMonth" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurringForecast_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecurringForecast_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`);
await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "RecurringForecast_contactId_productId_key" ON "RecurringForecast"("contactId", "productId")`);
const r = await db.execute(`SELECT COUNT(*) AS n FROM "RecurringForecast"`);
console.log("RecurringForecast ok, rows:", r.rows[0].n);
