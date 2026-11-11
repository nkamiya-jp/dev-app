import { createClient } from "@libsql/client";
import { writeFileSync } from "node:fs";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const out = process.argv[2];
const tables = process.argv.slice(3);
const dump = {};
for (const t of tables) dump[t] = (await db.execute(`SELECT * FROM "${t}"`)).rows;
writeFileSync(out, JSON.stringify({ takenAt: new Date().toISOString(), ...dump }));
console.log(Object.fromEntries(tables.map((t) => [t, dump[t].length])));
