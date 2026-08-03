// 顧客別アーカイブ対応: PriceListSnapshot / PriceListItem にカラム追加。
// 冪等 (存在チェック付き)。
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const migrations = [
  { table: "PriceListSnapshot", name: "kind", ddl: `ALTER TABLE "PriceListSnapshot" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'matrix'` },
  { table: "PriceListSnapshot", name: "contactId", ddl: `ALTER TABLE "PriceListSnapshot" ADD COLUMN "contactId" TEXT` },
  { table: "PriceListSnapshot", name: "contactName", ddl: `ALTER TABLE "PriceListSnapshot" ADD COLUMN "contactName" TEXT` },
  { table: "PriceListSnapshot", name: "contactRate", ddl: `ALTER TABLE "PriceListSnapshot" ADD COLUMN "contactRate" INTEGER` },
  { table: "PriceListItem", name: "note", ddl: `ALTER TABLE "PriceListItem" ADD COLUMN "note" TEXT` },
];

for (const m of migrations) {
  const info = await db.execute(`PRAGMA table_info("${m.table}")`);
  const existing = new Set(info.rows.map((r) => r.name));
  if (existing.has(m.name)) {
    console.log(`skip: ${m.table}.${m.name} already exists`);
    continue;
  }
  await db.execute(m.ddl);
  console.log(`added: ${m.table}.${m.name}`);
}

// index (存在すれば無視)
try {
  await db.execute(`CREATE INDEX IF NOT EXISTS "PriceListSnapshot_contactId_idx" ON "PriceListSnapshot"("contactId")`);
  console.log(`index ok: PriceListSnapshot_contactId_idx`);
} catch (e) {
  console.log(`index skip: ${e.message}`);
}

for (const t of ["PriceListSnapshot", "PriceListItem"]) {
  const after = await db.execute(`PRAGMA table_info("${t}")`);
  console.log(`${t} columns:`, after.rows.map((r) => r.name).join(", "));
}
