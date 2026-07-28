import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const info = await db.execute('PRAGMA table_info("Product")');
if (info.rows.some((r) => r.name === "purchaseCost")) {
  console.log("skip: Product.purchaseCost exists");
} else {
  await db.execute('ALTER TABLE "Product" ADD COLUMN "purchaseCost" INTEGER');
  console.log("added: Product.purchaseCost");
}
