// ロードマップ 段階3の移行：会社カレンダー・事業別の月目標（GAS版の書き出し JSON から）
// 何度流しても重複しない（カレンダー＝開始日＋タイトル、月目標＝GAS版のID で upsert）
// 実行: npx tsx --env-file=.env scripts/roadmap/import_stage3.mts <dataディレクトリ> [--apply]
//   --apply なし＝書き込まずに件数と中身の要約だけ出す
// ※ 列名は推測（会社カレンダー：開始日/終了日/区分/タイトル/詳細/公開範囲、
//    月目標：ID/月/事業・部門/目標/指標/目標値/実績/担当コメント/社長FB/状況）。実データで dry-run して確かめること
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../src/lib/db";
import { getRoadmapSettings } from "../../src/lib/roadmap/settings";

const [dir, flag] = process.argv.slice(2);
if (!dir) throw new Error("dataディレクトリを指定してください");
const apply = flag === "--apply";
type Row = Record<string, unknown>;
const load = (name: string): Row[] => {
  const p = join(dir, `${name}.json`);
  if (!existsSync(p)) { console.log(`（${name}.json が無いので読み飛ばし）`); return []; }
  return JSON.parse(readFileSync(p, "utf8"));
};
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const orNull = (v: unknown) => str(v) || null;
const pick = (r: Row, ...keys: string[]) => keys.map((k) => str(r[k])).find(Boolean) ?? "";
const ymd = (v: unknown) => {
  const m = str(v).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
};
const ym = (v: unknown) => {
  const m = str(v).match(/^(\d{4})[-/](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}` : null;
};
const { term } = await getRoadmapSettings();

// ── 会社カレンダー ──
const events = load("会社カレンダー")
  .map((r) => {
    const startDate = ymd(pick(r, "開始日", "日付", "開始"));
    const end = ymd(pick(r, "終了日", "終了"));
    const vis = pick(r, "公開範囲", "公開");
    return {
      startDate,
      endDate: end && startDate && end > startDate ? end : null,
      category: orNull(pick(r, "区分", "種別")),
      title: pick(r, "タイトル", "件名", "予定"),
      detail: orNull(pick(r, "詳細", "メモ")),
      visibility: /社長/.test(vis) ? "社長のみ" : "全員",
    };
  })
  .filter((e): e is typeof e & { startDate: string } => !!e.startDate && !!e.title);
console.log(`会社カレンダー ${events.length}件`);
for (const e of events) console.log(`  ${e.startDate}${e.endDate ? `〜${e.endDate}` : ""} ${e.title}（${e.category ?? "—"}・${e.visibility}）`);

// ── 事業別の月目標 ──
let lastTerm = term;
const monthGoals = load("月目標")
  .map((r, i) => {
    lastTerm = str(r["期"]) || lastTerm;
    const month = ym(pick(r, "月", "対象月"));
    return {
      legacyId: str(r["ID"]) || `${lastTerm}-${month}-${i}`,
      term: lastTerm,
      month,
      dept: pick(r, "事業・部門", "事業/部門", "事業", "部門"),
      goal: str(r["目標"]),
      kpi: orNull(pick(r, "指標", "指標(KPI)")),
      target: orNull(r["目標値"]),
      actual: orNull(r["実績"]),
      ownerComment: orNull(pick(r, "担当コメント", "コメント")),
      ceoFb: orNull(pick(r, "社長FB", "社長コメント")),
      status: orNull(pick(r, "状況", "進捗")),
      sortOrder: i,
    };
  })
  .filter((g): g is typeof g & { month: string } => !!g.month && !!g.goal && !!g.dept);
console.log(`\n月目標 ${monthGoals.length}件（${[...new Set(monthGoals.map((g) => `${g.month}/${g.dept}`))].join("、")}）`);

if (!apply) {
  console.log("\n（書き込みはしていません。--apply を付けると書き込みます）");
  process.exit(0);
}

for (const e of events) {
  const { startDate, title, ...rest } = e;
  await prisma.companyEvent.upsert({
    where: { startDate_title: { startDate, title } },
    update: rest,
    create: { startDate, title, ...rest },
  });
}
for (const g of monthGoals) {
  const { legacyId, ...data } = g;
  await prisma.bizMonthGoal.upsert({ where: { legacyId }, update: data, create: { legacyId, ...data } });
}

const [eCount, mCount] = await Promise.all([
  prisma.companyEvent.count({ where: { OR: events.map((e) => ({ startDate: e.startDate, title: e.title })) } }),
  prisma.bizMonthGoal.count({ where: { legacyId: { in: monthGoals.map((g) => g.legacyId) } } }),
]);
console.log("\n書き込み完了・件数照合（移行データ → DEV）");
console.log(`  会社カレンダー ${events.length} → ${eCount}`);
console.log(`  月目標 ${monthGoals.length} → ${mCount}`);
