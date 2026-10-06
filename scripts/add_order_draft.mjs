import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// OrderDraft: Slack #受注 から自動で取り込んだ「確認待ちの受注下書き」
// status: pending(確認待ち) | registered(受注登録済) | dismissed(対象外)
const tbl = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='OrderDraft'");
if (tbl.rows.length) {
  console.log("skip: OrderDraft exists");
} else {
  await db.execute(`
    CREATE TABLE "OrderDraft" (
      "id"            TEXT NOT NULL PRIMARY KEY,
      "source"        TEXT NOT NULL DEFAULT 'slack',
      "slackChannel"  TEXT,
      "slackTs"       TEXT,
      "slackUserId"   TEXT,
      "slackUserName" TEXT,
      "rawText"       TEXT NOT NULL,
      "status"        TEXT NOT NULL DEFAULT 'pending',
      "orderId"       TEXT,
      "postedAt"      DATETIME,
      "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OrderDraft_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await db.execute(`CREATE UNIQUE INDEX "OrderDraft_slackTs_key" ON "OrderDraft"("slackTs")`);
  await db.execute(`CREATE INDEX "OrderDraft_status_idx" ON "OrderDraft"("status")`);
  console.log("created OrderDraft");
}
