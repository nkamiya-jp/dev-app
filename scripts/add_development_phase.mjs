import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// 別注プロジェクトの段階と依頼主、受注とプロジェクトのひもづけ
// Development.phase: consult(相談・企画) | quote(見積) | sample(試作・サンプル) | approved(承認・正式発注) | production(量産中) | delivered(納品完了)
// Development.contactId: 依頼主（顧客）
// Order.developmentId: どの別注プロジェクトの受注か
const dcols = (await db.execute(`SELECT name FROM pragma_table_info('Development')`)).rows.map((r) => r.name);
if (!dcols.includes("phase")) {
  await db.execute(`ALTER TABLE "Development" ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'consult'`);
  console.log("added Development.phase");
}
if (!dcols.includes("contactId")) {
  await db.execute(
    `ALTER TABLE "Development" ADD COLUMN "contactId" TEXT REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE`
  );
  console.log("added Development.contactId");
}
const ocols = (await db.execute(`SELECT name FROM pragma_table_info('Order')`)).rows.map((r) => r.name);
if (!ocols.includes("developmentId")) {
  await db.execute(
    `ALTER TABLE "Order" ADD COLUMN "developmentId" TEXT REFERENCES "Development"("id") ON DELETE SET NULL ON UPDATE CASCADE`
  );
  await db.execute(`CREATE INDEX IF NOT EXISTS "Order_developmentId_idx" ON "Order"("developmentId")`);
  console.log("added Order.developmentId");
}

// 既存データ：完了済みのプロジェクトは「納品完了」に
const r = await db.execute(`UPDATE "Development" SET "phase" = 'delivered' WHERE "status" = 'released' AND "phase" = 'consult'`);
if (r.rowsAffected) console.log("backfill released -> delivered:", r.rowsAffected);
