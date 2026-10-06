import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// Contact.dailyOrder: 毎日注文の取引先（受注進捗ボード・Slack取り込みの対象外）
// Contact.orderAliases: Slack投稿での呼び名（カンマ区切り。例: 嵐山,よしとよ）
// OrderDraft.excludedReason: 自動で除外した理由
const ccols = (await db.execute(`SELECT name FROM pragma_table_info('Contact')`)).rows.map((r) => r.name);
if (!ccols.includes("dailyOrder")) {
  await db.execute(`ALTER TABLE "Contact" ADD COLUMN "dailyOrder" INTEGER NOT NULL DEFAULT 0`);
  console.log("added Contact.dailyOrder");
}
if (!ccols.includes("orderAliases")) {
  await db.execute(`ALTER TABLE "Contact" ADD COLUMN "orderAliases" TEXT`);
  console.log("added Contact.orderAliases");
}
const dcols = (await db.execute(`SELECT name FROM pragma_table_info('OrderDraft')`)).rows.map((r) => r.name);
if (!dcols.includes("excludedReason")) {
  await db.execute(`ALTER TABLE "OrderDraft" ADD COLUMN "excludedReason" TEXT`);
  console.log("added OrderDraft.excludedReason");
}

// 初期設定：清水・よしとよ嵐山を毎日注文の取引先に
const targets = [
  { company: "清水", aliases: "清水" },
  { company: "よしとよ嵐山", aliases: "嵐山,よしとよ" },
];
for (const t of targets) {
  const r = await db.execute({
    sql: `UPDATE "Contact" SET "dailyOrder" = 1, "orderAliases" = COALESCE("orderAliases", ?) WHERE "company" = ?`,
    args: [t.aliases, t.company],
  });
  console.log(`dailyOrder ${t.company}: ${r.rowsAffected}`);
}
