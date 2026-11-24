// ロードマップ 段階3：事業別の月目標・社内掲示板・会社カレンダーのテーブルを作る（何度流しても安全）
// 実行: node --env-file=.env scripts/roadmap/add_stage3_tables.mjs
import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

await db.execute(`CREATE TABLE IF NOT EXISTS "BizMonthGoal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "legacyId" TEXT,
  "term" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "dept" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "kpi" TEXT,
  "target" TEXT,
  "actual" TEXT,
  "ownerComment" TEXT,
  "ceoFb" TEXT,
  "status" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "BizMonthGoal_legacyId_key" ON "BizMonthGoal"("legacyId")`);
await db.execute(`CREATE INDEX IF NOT EXISTS "BizMonthGoal_term_month_idx" ON "BizMonthGoal"("term", "month")`);

await db.execute(`CREATE TABLE IF NOT EXISTS "BoardPost" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "authorId" TEXT,
  "authorName" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS "BoardPost_pinned_createdAt_idx" ON "BoardPost"("pinned", "createdAt")`);

await db.execute(`CREATE TABLE IF NOT EXISTS "CompanyEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT,
  "category" TEXT,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "visibility" TEXT NOT NULL DEFAULT '全員',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "CompanyEvent_startDate_title_key" ON "CompanyEvent"("startDate", "title")`);
await db.execute(`CREATE INDEX IF NOT EXISTS "CompanyEvent_startDate_idx" ON "CompanyEvent"("startDate")`);

console.log("tables ready: BizMonthGoal, BoardPost, CompanyEvent");
