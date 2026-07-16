import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// CustomerPrice: 顧客の取扱商品＋個別卸価格
const tbl = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='CustomerPrice'");
if (tbl.rows.length) {
  console.log("skip: CustomerPrice table exists");
} else {
  await db.execute(`
    CREATE TABLE "CustomerPrice" (
      "id"        TEXT NOT NULL PRIMARY KEY,
      "contactId" TEXT NOT NULL,
      "productId" TEXT NOT NULL,
      "price"     INTEGER,
      "note"      TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CustomerPrice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CustomerPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await db.execute('CREATE UNIQUE INDEX "CustomerPrice_contactId_productId_key" ON "CustomerPrice"("contactId", "productId")');
  await db.execute('CREATE INDEX "CustomerPrice_contactId_idx" ON "CustomerPrice"("contactId")');
  console.log("created: CustomerPrice table + indexes");
}
