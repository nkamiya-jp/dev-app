import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// Task.startDate（着手予定日）
const info = await db.execute('PRAGMA table_info("Task")');
if (info.rows.some((r) => r.name === "startDate")) {
  console.log("skip: Task.startDate exists");
} else {
  await db.execute('ALTER TABLE "Task" ADD COLUMN "startDate" DATETIME');
  console.log("added: Task.startDate");
}

// Milestone（プロジェクトの節目）
const tbl = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='Milestone'");
if (tbl.rows.length) {
  console.log("skip: Milestone table exists");
} else {
  await db.execute(`
    CREATE TABLE "Milestone" (
      "id"            TEXT NOT NULL PRIMARY KEY,
      "developmentId" TEXT NOT NULL,
      "title"         TEXT NOT NULL,
      "date"          DATETIME NOT NULL,
      "note"          TEXT,
      "done"          BOOLEAN NOT NULL DEFAULT false,
      "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Milestone_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await db.execute('CREATE INDEX "Milestone_developmentId_idx" ON "Milestone"("developmentId")');
  console.log("created: Milestone table + index");
}
