// ロードマップ 段階3のテーブル（BizMonthGoal・BoardPost・CompanyEvent）を、最初に使われたときに自動で作る。サーバー側専用
// CREATE ... IF NOT EXISTS だけなので、何度走っても既存のデータには触れない。
// scripts/roadmap/add_stage3_tables.mjs と同じ SQL（手で先に作っておいてもよい）
import { prisma } from "@/lib/db";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "BizMonthGoal" (
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
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "BizMonthGoal_legacyId_key" ON "BizMonthGoal"("legacyId")`,
  `CREATE INDEX IF NOT EXISTS "BizMonthGoal_term_month_idx" ON "BizMonthGoal"("term", "month")`,
  `CREATE TABLE IF NOT EXISTS "BoardPost" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "authorId" TEXT,
  "authorName" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE INDEX IF NOT EXISTS "BoardPost_pinned_createdAt_idx" ON "BoardPost"("pinned", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "CompanyEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT,
  "category" TEXT,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "visibility" TEXT NOT NULL DEFAULT '全員',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CompanyEvent_startDate_title_key" ON "CompanyEvent"("startDate", "title")`,
  `CREATE INDEX IF NOT EXISTS "CompanyEvent_startDate_idx" ON "CompanyEvent"("startDate")`,
];

let ready: Promise<void> | null = null;

export function ensureStage3Tables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const sql of STATEMENTS) await prisma.$executeRawUnsafe(sql);
    })().catch((e) => {
      ready = null; // 失敗したら次のリクエストでもう一度試す
      throw e;
    });
  }
  return ready;
}
