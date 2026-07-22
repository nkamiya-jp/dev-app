import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// Task.contactId は Prisma 上 String?（任意）だが、実テーブルは NOT NULL のままだった。
// そのため顧客に紐づかないタスク（商品開発のタスクなど）が作成できなかった。
// SQLite は列制約の変更ができないため、テーブルを作り直す。

const cur = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='Task'");
if (!cur.rows.length) {
  console.log("Task テーブルが存在しません");
  process.exit(1);
}
if (!/"contactId" TEXT NOT NULL/.test(String(cur.rows[0].sql))) {
  console.log("skip: contactId は既に NULL 許容です");
  process.exit(0);
}

const before = await db.execute("SELECT COUNT(*) AS n FROM Task");
const beforeCount = Number(before.rows[0].n);
console.log("移行前 Task 件数:", beforeCount);

await db.execute("PRAGMA foreign_keys=OFF");

await db.execute(`
  CREATE TABLE "Task_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "developmentId" TEXT,
    "dueDate" DATETIME,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "forStage" TEXT,
    "assignee" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_developmentId_fkey" FOREIGN KEY ("developmentId") REFERENCES "Development" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )
`);

await db.execute(`
  INSERT INTO "Task_new" (id, title, description, contactId, dealId, developmentId, dueDate, priority, status, forStage, assignee, completed, createdAt, updatedAt)
  SELECT id, title, description, contactId, dealId, developmentId, dueDate, priority, status, forStage, assignee, completed, createdAt, updatedAt FROM "Task"
`);

const copied = await db.execute('SELECT COUNT(*) AS n FROM "Task_new"');
if (Number(copied.rows[0].n) !== beforeCount) {
  console.error(`中断: コピー件数不一致 ${copied.rows[0].n} != ${beforeCount}`);
  await db.execute('DROP TABLE "Task_new"');
  process.exit(1);
}

await db.execute('DROP TABLE "Task"');
await db.execute('ALTER TABLE "Task_new" RENAME TO "Task"');
await db.execute("PRAGMA foreign_keys=ON");

const after = await db.execute("SELECT COUNT(*) AS n FROM Task");
console.log("移行後 Task 件数:", Number(after.rows[0].n));
console.log(Number(after.rows[0].n) === beforeCount ? "✓ 件数一致・移行完了" : "✗ 件数不一致");
