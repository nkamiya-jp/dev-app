// ロードマップ 段階2：メンバーにログイン・権限の列を追加し、事業目標・個人目標のテーブルを作る
// 実行: node --env-file=.env scripts/roadmap/add_stage2_tables.mjs
import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const cols = (await db.execute(`PRAGMA table_info("Member")`)).rows.map((r) => r.name);
const memberCols = [
  ["email", `TEXT`], // ログインの照合キー（内職さんは空）
  ["permission", `TEXT`], // president | staff | part（空＝ログイン不可）
  ["departments", `TEXT`], // 営業、制作、出荷（「、」区切り）
  ["employment", `TEXT NOT NULL DEFAULT '在籍'`], // 在籍 | 退職
];
for (const [name, type] of memberCols) {
  if (cols.includes(name)) {
    console.log("exists: Member.", name);
    continue;
  }
  await db.execute(`ALTER TABLE "Member" ADD COLUMN "${name}" ${type}`);
  console.log("added: Member.", name);
}
await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "Member_email_key" ON "Member"("email")`);

await db.execute(`CREATE TABLE IF NOT EXISTS "BizGoal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "legacyId" TEXT,
  "term" TEXT NOT NULL,
  "grain" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "kpi" TEXT,
  "target" TEXT,
  "actual" TEXT,
  "owner" TEXT,
  "status" TEXT,
  "comment" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "BizGoal_legacyId_key" ON "BizGoal"("legacyId")`);
await db.execute(`CREATE INDEX IF NOT EXISTS "BizGoal_term_idx" ON "BizGoal"("term")`);

await db.execute(`CREATE TABLE IF NOT EXISTS "PersonalGoal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "legacyId" TEXT,
  "memberId" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "quarter" TEXT,
  "month" TEXT,
  "parentId" TEXT,
  "bizGoalId" TEXT,
  "qtype" TEXT NOT NULL DEFAULT '定量',
  "goal" TEXT NOT NULL,
  "criteria" TEXT,
  "kpi" TEXT,
  "target" TEXT,
  "result" TEXT,
  "progress" TEXT,
  "weight" INTEGER,
  "selfGrade" TEXT,
  "selfComment" TEXT,
  "fb" TEXT,
  "ceoGrade" TEXT,
  "ceoComment" TEXT,
  "status" TEXT NOT NULL DEFAULT '設定中',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonalGoal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonalGoal_bizGoalId_fkey" FOREIGN KEY ("bizGoalId") REFERENCES "BizGoal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
)`);
await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "PersonalGoal_legacyId_key" ON "PersonalGoal"("legacyId")`);
await db.execute(`CREATE INDEX IF NOT EXISTS "PersonalGoal_memberId_term_idx" ON "PersonalGoal"("memberId", "term")`);
await db.execute(`CREATE INDEX IF NOT EXISTS "PersonalGoal_bizGoalId_idx" ON "PersonalGoal"("bizGoalId")`);
console.log("tables ready: BizGoal, PersonalGoal");
