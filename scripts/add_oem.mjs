// OEM：顧客専用の商品（Product.ownerContactId）と、見積の履歴（OemQuote）
// 実行: node --env-file=.env scripts/add_oem.mjs
import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const cols = (await db.execute(`PRAGMA table_info("Product")`)).rows.map((r) => r.name);
const add = [
  ["ownerContactId", `TEXT REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE`], // OEMの依頼主（空＝自社商品）
  ["oemMultiplier", `REAL`], // 決めた倍率（普段の量で決めて固定）
  ["oemIncludePackaging", `BOOLEAN NOT NULL DEFAULT 0`], // 梱包資材を原価に含めるか
  ["oemPrice", `INTEGER`], // 決めたOEM単価（顧客別価格にも入れる）
  ["oemPricedCost", `INTEGER`], // 単価を決めた時の原価（値上がりに気づくため）
  ["oemPricedAt", `DATETIME`],
];
for (const [name, type] of add) {
  if (cols.includes(name)) {
    console.log("exists: Product.", name);
    continue;
  }
  await db.execute(`ALTER TABLE "Product" ADD COLUMN "${name}" ${type}`);
  console.log("added: Product.", name);
}
await db.execute(`CREATE INDEX IF NOT EXISTS "Product_ownerContactId_idx" ON "Product"("ownerContactId")`);

await db.execute(`CREATE TABLE IF NOT EXISTS "OemQuote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "contactId" TEXT,
  "quantity" INTEGER NOT NULL,
  "multiplier" REAL NOT NULL,
  "includePackaging" BOOLEAN NOT NULL DEFAULT 0,
  "unitCost" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "extras" TEXT,
  "note" TEXT,
  "adopted" BOOLEAN NOT NULL DEFAULT 0,
  "createdBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OemQuote_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OemQuote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS "OemQuote_productId_idx" ON "OemQuote"("productId")`);
console.log("table ready: OemQuote");
