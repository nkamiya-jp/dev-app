import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
for (const t of process.argv.slice(2)) {
  const r = (await db.execute(`PRAGMA table_info("${t}")`)).rows;
  console.log(t, r.filter((c) => c.notnull && c.dflt_value == null && !c.pk).map((c) => c.name));
}
