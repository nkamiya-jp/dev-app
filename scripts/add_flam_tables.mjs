import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// FLAM（販売管理）との対応付け。
// Contact.flamCode = FLAMの得意先コード。FlamProductMap = FLAM商品コード → DEV商品（未登録はproductIdなし）。
// FlamPrice = FLAMの得意先×商品の単価（DEVに商品・顧客が無いものも保持し、あとで紐づける）。
const cols = (await db.execute(`PRAGMA table_info("Contact")`)).rows.map((r) => r.name);
if (!cols.includes("flamCode")) {
  await db.execute(`ALTER TABLE "Contact" ADD COLUMN "flamCode" TEXT`);
  await db.execute(`CREATE UNIQUE INDEX "Contact_flamCode_key" ON "Contact"("flamCode")`);
  console.log("added Contact.flamCode");
} else console.log("skip: Contact.flamCode exists");

const has = async (t) => (await db.execute({ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?", args: [t] })).rows.length > 0;

if (!(await has("FlamProductMap"))) {
  await db.execute(`
    CREATE TABLE "FlamProductMap" (
      "flamCode"  TEXT NOT NULL PRIMARY KEY,
      "productId" TEXT,
      "flamName"  TEXT NOT NULL,
      "spec"      TEXT,
      "status"    TEXT NOT NULL DEFAULT 'unmapped',
      "note"      TEXT,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "FlamProductMap_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`);
  await db.execute(`CREATE INDEX "FlamProductMap_productId_idx" ON "FlamProductMap"("productId")`);
  console.log("created FlamProductMap");
} else console.log("skip: FlamProductMap exists");

if (!(await has("FlamPrice"))) {
  await db.execute(`
    CREATE TABLE "FlamPrice" (
      "flamCustomerCode" TEXT NOT NULL,
      "flamProductCode"  TEXT NOT NULL,
      "flamCustomerName" TEXT NOT NULL,
      "flamProductName"  TEXT NOT NULL,
      "spec"             TEXT,
      "registeredPrice"  INTEGER,
      "lastPrice"        INTEGER,
      "lastMonth"        TEXT,
      "qty12"            INTEGER NOT NULL DEFAULT 0,
      "importedAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("flamCustomerCode", "flamProductCode")
    )`);
  await db.execute(`CREATE INDEX "FlamPrice_flamProductCode_idx" ON "FlamPrice"("flamProductCode")`);
  console.log("created FlamPrice");
} else console.log("skip: FlamPrice exists");
