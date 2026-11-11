import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const one = async (s) => (await db.execute(s)).rows;
console.log({
  contacts: (await one(`SELECT COUNT(*) n FROM "Contact"`))[0].n,
  withFlam: (await one(`SELECT COUNT(*) n FROM "Contact" WHERE "flamCode" IS NOT NULL`))[0].n,
  customerPrices: (await one(`SELECT COUNT(*) n FROM "CustomerPrice"`))[0].n,
  fromFlam: (await one(`SELECT COUNT(*) n FROM "CustomerPrice" WHERE "note" LIKE 'FLAM実績%'`))[0].n,
  productMap: await one(`SELECT "status", COUNT(*) n FROM "FlamProductMap" GROUP BY "status"`),
  flamPrice: (await one(`SELECT COUNT(*) n FROM "FlamPrice"`))[0].n,
  shimizu: await one(`SELECT "name","type","flamCode" FROM "Contact" WHERE "flamCode"='00000030'`),
  takeen: await one(`SELECT p."name", cp."price", cp."note" FROM "CustomerPrice" cp JOIN "Product" p ON p."id"=cp."productId" JOIN "Contact" c ON c."id"=cp."contactId" WHERE c."flamCode"='00000028' ORDER BY p."name"`),
  types: await one(`SELECT "type", COUNT(*) n FROM "Contact" GROUP BY "type"`),
});
