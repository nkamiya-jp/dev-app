// アーティファクト台帳の GS1登録・上代・ブランド・使用先 を DEV の JanItem に入れる（空欄の項目だけ埋める）
// 実行: npx tsx --env-file=.env scripts/backfill_jan_from_artifact.mts <itemsのJSONディレクトリ>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";

const dir = process.argv[2];
const arts = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

const items = await prisma.janItem.findMany({ where: { jan: { in: arts.map((a) => a.jan) } } });
const byJan = new Map(items.map((x) => [x.jan, x]));
let n = 0;
for (const a of arts) {
  const d = byJan.get(a.jan);
  if (!d) continue;
  const price = typeof a.price === "number" ? a.price : /^\d+$/.test(String(a.price ?? "")) ? Number(a.price) : null;
  const data = {
    ...(a.gs1 === "registered" && !d.gs1Registered && { gs1Registered: true }),
    ...(d.price == null && price != null && { price }),
    ...(!d.brand && a.brand && { brand: a.brand }),
    ...(!d.channels && a.channels && { channels: a.channels }),
  };
  if (!Object.keys(data).length) continue;
  await prisma.janItem.update({ where: { id: d.id }, data });
  n++;
}
console.log("updated:", n, "/", arts.length);
