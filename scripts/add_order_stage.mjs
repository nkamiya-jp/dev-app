import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// 受注の進捗段階: received(受注) | production(制作中) | preparing(出荷準備) | shipped(出荷済) | cancelled
const cols = (await db.execute(`SELECT name FROM pragma_table_info('Order')`)).rows.map((r) => r.name);

if (!cols.includes("stage")) {
  await db.execute(`ALTER TABLE "Order" ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'received'`);
  console.log("added Order.stage");
} else {
  console.log("skip: Order.stage exists");
}
if (!cols.includes("stageUpdatedAt")) {
  await db.execute(`ALTER TABLE "Order" ADD COLUMN "stageUpdatedAt" DATETIME`);
  console.log("added Order.stageUpdatedAt");
} else {
  console.log("skip: Order.stageUpdatedAt exists");
}

// 既存の status から初期値を引き継ぐ（stage が初期値のものだけ）
const map = { completed: "shipped", cancelled: "cancelled", in_progress: "production", pending: "received" };
for (const [status, stage] of Object.entries(map)) {
  const r = await db.execute({
    sql: `UPDATE "Order" SET "stage" = ? WHERE "status" = ? AND "stage" = 'received'`,
    args: [stage, status],
  });
  if (r.rowsAffected) console.log(`backfill ${status} -> ${stage}: ${r.rowsAffected}`);
}

const after = await db.execute(`SELECT status, stage, COUNT(*) n FROM "Order" GROUP BY status, stage`);
console.log(after.rows.map((x) => `${x.status}/${x.stage}=${x.n}`).join(", "));
