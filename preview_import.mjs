import { createClient } from "@libsql/client";
import { readFileSync } from "fs";

const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// 1. CRM 商品一覧
const dbProducts = (await c.execute("SELECT id, code, name FROM Product ORDER BY name")).rows;
console.log(`CRM products: ${dbProducts.length}`);

// 2. スプレッドシート読込
const raw = JSON.parse(readFileSync("/Users/NaoyukiKamiya/.claude/projects/-Users-NaoyukiKamiya-claude-app/42b51166-093b-4771-b83a-86718aff9161/tool-results/mcp-3e8928e8-0bd6-40bd-9738-9cd36c6c2a8f-read_file_content-1779096018160.txt", "utf8"));
const lines = raw.fileContent.split("\n");

// 商品マスタの行は line 77 から（NO_HEADERテーブル）
function parsePrice(s) {
  if (!s) return null;
  const cleaned = String(s).replace(/[¥￥,円]/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : Math.round(n);
}
function normalize(s) {
  return String(s||"").replace(/[\s　　)）(（[\]【】]/g, "").replace(/\\\[/g,"").replace(/\\\]/g,"").toLowerCase();
}

const sheetProducts = [];
for (let i = 77; i < lines.length; i++) {
  const line = lines[i];
  if (!line.startsWith("|")) continue;
  const cells = line.split("|").slice(1, -1).map(s => s.trim());
  if (cells.length < 12) continue;
  const code = cells[0];
  const name = cells[1];
  if (!name || name === "NO_HEADER") continue;
  // Skip section headers like "営業費10%"
  if (/^[¥￥0-9]/.test(name) || name.includes("計算") || name.includes("裏裁断")) continue;
  
  sheetProducts.push({
    code: code || null,
    name,
    amazon:        parsePrice(cells[2]),
    retail:        parsePrice(cells[3]),
    sd:            parsePrice(cells[4]),
    wholesale50:   parsePrice(cells[5]),
    kyoto:         parsePrice(cells[8]),
    wholesale38:   parsePrice(cells[9]),
    materialCost:  parsePrice(cells[11]),
    fabricName:    cells[12] || null,
    fabricPrice:   parsePrice(cells[13]),
    liningName:    cells[14] || null,
    liningPrice:   parsePrice(cells[15]),
    meters:        cells[16] ? parseFloat(String(cells[16]).replace("m","")) : null,
    yield:         cells[18] ? Number(cells[18]) : null,
    shippingCost:  parsePrice(cells[21]),
    outboundCost:  parsePrice(cells[22]),
    mgmtCost:      parsePrice(cells[23]),
    purchase:      cells[24] || null,
    homework:      parsePrice(cells[25]),
    productionCost: parsePrice(cells[26]),
    sewCost:       parsePrice(cells[27]),
    bandCost:      parsePrice(cells[28]),
    sealCost:      parsePrice(cells[29]),
    ppCost:        parsePrice(cells[30]),
    komiCost:      parsePrice(cells[31]),
  });
}
console.log(`Sheet products: ${sheetProducts.length}`);

// 3. 名前マッチング
const matches = [];
const unmatched = [];
for (const sp of sheetProducts) {
  const spN = normalize(sp.name);
  // exact
  let m = dbProducts.find(p => normalize(p.name) === spN);
  // contains (両方向)
  if (!m) m = dbProducts.find(p => normalize(p.name).includes(spN) || spN.includes(normalize(p.name)));
  if (m) matches.push({ sheet: sp, db: m });
  else unmatched.push(sp);
}
console.log(`Matches: ${matches.length}, Unmatched: ${unmatched.length}`);

console.log("\n=== マッチ例（10件）===");
matches.slice(0, 10).forEach(({ sheet, db }) => {
  console.log(`  [${sheet.code}] "${sheet.name}" → [${db.code}] "${db.name}"`);
  console.log(`    運賃=${sheet.shippingCost} 出荷=${sheet.outboundCost} 管理=${sheet.mgmtCost} 上代=${sheet.retail}`);
});

console.log("\n=== 未マッチ（スプレッドシート側、最初20件）===");
unmatched.slice(0, 20).forEach(sp => console.log(`  [${sp.code}] ${sp.name}`));
