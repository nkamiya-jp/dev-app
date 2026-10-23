import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// JAN台帳（社内台帳。JANの正はGS1のGJDB）
//   status: used(使用中) | reserved(確保。柄コード等に用途メモ) | free(空き)
// JanPrefix: GS1事業者コードと、採番に使う品目コードの範囲
const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) => r.name);

if (!tables.includes("JanPrefix")) {
  await db.execute(`
    CREATE TABLE "JanPrefix" (
      "id"         TEXT NOT NULL PRIMARY KEY,
      "prefix"     TEXT NOT NULL,
      "label"      TEXT,
      "rangeStart" INTEGER NOT NULL DEFAULT 0,
      "rangeEnd"   INTEGER NOT NULL DEFAULT 999,
      "active"     INTEGER NOT NULL DEFAULT 1,
      "note"       TEXT,
      "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute(`CREATE UNIQUE INDEX "JanPrefix_prefix_key" ON "JanPrefix"("prefix")`);
  console.log("created JanPrefix");
} else console.log("skip: JanPrefix exists");

if (!tables.includes("JanItem")) {
  await db.execute(`
    CREATE TABLE "JanItem" (
      "id"               TEXT NOT NULL PRIMARY KEY,
      "jan"              TEXT NOT NULL,
      "companyPrefix"    TEXT NOT NULL,
      "itemCode"         INTEGER NOT NULL,
      "status"           TEXT NOT NULL DEFAULT 'used',
      "productName"      TEXT,
      "nameOther"        TEXT,
      "patternCode"      TEXT,
      "productId"        TEXT,
      "amazonListed"     INTEGER NOT NULL DEFAULT 0,
      "amazonComolife"   INTEGER NOT NULL DEFAULT 0,
      "pastAmazonListed" INTEGER NOT NULL DEFAULT 0,
      "pastAmazonCode"   TEXT,
      "legacyRecordNo"   INTEGER,
      "note"             TEXT,
      "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "JanItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await db.execute(`CREATE UNIQUE INDEX "JanItem_jan_key" ON "JanItem"("jan")`);
  await db.execute(`CREATE INDEX "JanItem_prefix_item_idx" ON "JanItem"("companyPrefix", "itemCode")`);
  await db.execute(`CREATE INDEX "JanItem_productId_idx" ON "JanItem"("productId")`);
  await db.execute(`CREATE INDEX "JanItem_status_idx" ON "JanItem"("status")`);
  console.log("created JanItem");
} else console.log("skip: JanItem exists");
