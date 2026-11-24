// 商品×顧客カテゴリの掛率（上書き）用の列を追加する。
// 実行: node --env-file=.env scripts/add-product-type-rates.mjs
import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const cols = await db.execute("PRAGMA table_info(Product)");
if (cols.rows.some((r) => r.name === "typeRates")) {
  console.log("typeRates はすでにあります。何もしません。");
} else {
  await db.execute("ALTER TABLE Product ADD COLUMN typeRates TEXT");
  console.log("Product.typeRates を追加しました。");
}
