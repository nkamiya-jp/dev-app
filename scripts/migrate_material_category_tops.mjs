// 資材カテゴリに「大分類(top)」を導入し、各カテゴリを紐付ける移行。
// - 生地費 / 資材費 / 梱包資材費 の3つを kind="top" で作成（無ければ）
// - 既存カテゴリ(leaf)の parentId を正しい大分類へ張り替え、kind="leaf" に統一
// 冪等: 何度実行しても同じ結果になる。
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const now = new Date().toISOString();

const TOPS = [
  { id: "cat_top_fabric", name: "生地費", color: "bg-purple-100 text-purple-700", unitType: "meter" },
  { id: "cat_top_material", name: "資材費", color: "bg-blue-100 text-blue-700", unitType: "piece" },
  { id: "cat_top_packaging", name: "梱包資材費", color: "bg-emerald-100 text-emerald-700", unitType: "piece" },
];

// leaf カテゴリ名 → 大分類名
const LEAF_TO_TOP = {
  "表地": "生地費", "裏地": "生地費", "芯材": "生地費",
  "口金": "資材費", "ボタン": "資材費", "ファスナー": "資材費",
  "箱": "資材費", "鏡": "資材費", "資材": "資材費", "その他": "資材費",
  "梱包資材": "梱包資材費",
};

// 1) top を作成（名前で存在チェック）
for (const t of TOPS) {
  const exists = await db.execute({
    sql: `SELECT id FROM "MaterialCategory" WHERE name = ?`,
    args: [t.name],
  });
  if (exists.rows.length === 0) {
    await db.execute({
      sql: `INSERT INTO "MaterialCategory"
        (id,name,color,unitType,parentId,kind,sortOrder,active,createdAt,updatedAt)
        VALUES (?,?,?,?,NULL,'top',0,1,?,?)`,
      args: [t.id, t.name, t.color, t.unitType, now, now],
    });
    console.log(`created top: ${t.name}`);
  } else {
    // 既にあれば kind を top に正規化
    await db.execute({
      sql: `UPDATE "MaterialCategory" SET kind='top', parentId=NULL, updatedAt=? WHERE name=?`,
      args: [now, t.name],
    });
    console.log(`top exists (normalized): ${t.name}`);
  }
}

// top 名 → id を取得
const topRows = await db.execute(`SELECT id,name FROM "MaterialCategory" WHERE kind='top'`);
const topIdByName = Object.fromEntries(topRows.rows.map((r) => [r.name, r.id]));

// 2) leaf の parentId を張り替え
const all = await db.execute(`SELECT id,name,kind FROM "MaterialCategory"`);
let updated = 0, skipped = 0;
for (const row of all.rows) {
  if (row.kind === "top") continue;
  const topName = LEAF_TO_TOP[row.name];
  if (!topName) {
    console.log(`  ! 未対応カテゴリ(手動確認): ${row.name}`);
    skipped++;
    continue;
  }
  const parentId = topIdByName[topName];
  await db.execute({
    sql: `UPDATE "MaterialCategory" SET parentId=?, kind='leaf', updatedAt=? WHERE id=?`,
    args: [parentId, now, row.id],
  });
  updated++;
}
console.log(`\nleaf updated: ${updated}, skipped: ${skipped}`);

// 3) 検証: 現在の階層を表示
const check = await db.execute(`
  SELECT c.name AS leaf, c.kind, p.name AS top, c.sortOrder
  FROM "MaterialCategory" c
  LEFT JOIN "MaterialCategory" p ON c.parentId = p.id
  ORDER BY c.kind DESC, c.sortOrder ASC, c.name ASC
`);
console.log("\n=== 移行後の状態 ===");
console.log(check.rows.map((r) => `${r.kind}\t大分類:${r.top ?? "-"}\t${r.leaf}`).join("\n"));
