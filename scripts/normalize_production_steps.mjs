import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// 制作費の工程名を固定4種（口金/貼り/縫製/その他）に揃える。
// 口金/貼り/縫製 以外の自由入力名（新工程など）は「その他」に寄せる。
const target = await db.execute(
  "SELECT id, step FROM ProductCostStep WHERE (category='制作費' OR category IS NULL) AND step NOT IN ('口金','貼り','縫製','その他')"
);
if (target.rows.length === 0) {
  console.log("skip: 非固定名の制作工程はありません");
} else {
  target.rows.forEach((x) => console.log(`  「${x.step}」→ その他`));
  await db.execute(
    "UPDATE ProductCostStep SET step='その他' WHERE (category='制作費' OR category IS NULL) AND step NOT IN ('口金','貼り','縫製','その他')"
  );
  console.log(`updated: ${target.rows.length}件`);
}
