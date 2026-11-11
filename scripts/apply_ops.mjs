import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// [sql, args][] のJSONを小さなバッチで順に実行する（大きなトランザクションを避ける）
const ops = JSON.parse(readFileSync(process.argv[2], "utf8"));
const size = 50;
let done = 0;
for (let i = 0; i < ops.length; i += size) {
  const chunk = ops.slice(i, i + size).map(([sql, args]) => ({ sql, args }));
  await db.batch(chunk, "write");
  done += chunk.length;
  if (done % 500 < size) console.log(`${done}/${ops.length}`);
}
console.log(`done ${done}`);
