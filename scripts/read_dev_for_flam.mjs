import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const q = async (s) => (await db.execute(s)).rows;
console.log(JSON.stringify({
  products: await q(`SELECT id, code, name, series, size, active, ownerContactId FROM "Product"`),
  contacts: await q(`SELECT id, name, company, type, discountRate FROM "Contact"`),
  prices: await q(`SELECT contactId, productId, price, note FROM "CustomerPrice"`),
  aliases: await q(`SELECT label, productId FROM "ProductAlias"`),
}));
