import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// AppSetting: アプリ全体の設定（key → JSON文字列）。価格計算の設定は key='pricing'。
const tbl = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='AppSetting'");
if (tbl.rows.length) {
  console.log("skip: AppSetting exists");
} else {
  await db.execute(`
    CREATE TABLE "AppSetting" (
      "key"       TEXT NOT NULL PRIMARY KEY,
      "value"     TEXT NOT NULL,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("created AppSetting");
}
