import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function addCol(table, col, ddl) {
  const info = await db.execute(`PRAGMA table_info("${table}")`);
  if (info.rows.some((r) => r.name === col)) {
    console.log(`skip: ${table}.${col} exists`);
  } else {
    await db.execute(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
    console.log(`added: ${table}.${col}`);
  }
}

// Material: 生地の尺（1反の長さ）
await addCol("Material", "fabricLength", '"fabricLength" REAL');

// ProductMaterial: 生地ごとの裁断サイズ・裁断方法（記録用）
await addCol("ProductMaterial", "cutH", '"cutH" REAL');
await addCol("ProductMaterial", "cutW", '"cutW" REAL');
await addCol("ProductMaterial", "cutType", '"cutType" TEXT');
