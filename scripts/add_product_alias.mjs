import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// ProductAlias: Slack投稿などでの商品の書き方（例: 朱印袋）→ 商品マスタの対応。
// 受注登録時に担当者が確定した対応を記録し、次回からAIの読み取りに使う。
const tbl = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ProductAlias'");
if (tbl.rows.length) {
  console.log("skip: ProductAlias exists");
} else {
  await db.execute(`
    CREATE TABLE "ProductAlias" (
      "id"        TEXT NOT NULL PRIMARY KEY,
      "label"     TEXT NOT NULL,
      "productId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await db.execute(`CREATE UNIQUE INDEX "ProductAlias_label_key" ON "ProductAlias"("label")`);
  console.log("created ProductAlias");
}
