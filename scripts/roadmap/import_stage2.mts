// ロードマップ 段階2の移行：メンバー・設定・事業目標・個人目標（GAS版の書き出し JSON から）
// 何度流しても重複しない（メンバー＝メール/氏名、目標＝GAS版のID で upsert）
// 実行: npx tsx --env-file=.env scripts/roadmap/import_stage2.mts <dataディレクトリ> [--apply]
//   --apply なし＝書き込まずに対応表と件数だけ出す
// ※ 移行データ（売上・評価を含む）は repo の外に置くこと
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../src/lib/db";
import { ROADMAP_SETTING_PREFIX } from "../../src/lib/roadmap/settings";
import { quarterOfMonth } from "../../src/lib/roadmap/goal-rules";

const [dir, flag] = process.argv.slice(2);
if (!dir) throw new Error("dataディレクトリを指定してください");
const apply = flag === "--apply";
type Row = Record<string, unknown>;
const load = (name: string): Row[] => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const orNull = (v: unknown) => str(v) || null;
const ym = (v: unknown) => {
  const s = str(v);
  const m = s.match(/^(\d{4})[-/](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}` : null;
};
const PERM: Record<string, string> = { 社長: "president", スタッフ: "staff", パート: "part" };

// ── 設定 ──
const settings = load("設定");
const setting: Record<string, string> = {};
for (const r of settings) {
  const key = str(r["キー"]);
  if (!key) continue;
  let value = str(r["値"]);
  if (key === "期首日") value = value.slice(0, 10);
  setting[key] = value;
}
const term = setting["現在の期"] || "第10期";
console.log(`設定 ${Object.keys(setting).length}件（現在の期=${term}・期首日=${setting["期首日"]}）`);

// ── メンバー ──
const devMembers = await prisma.member.findMany();
const memberRows = load("メンバー").filter((r) => str(r["氏名"]));
const plan: { row: Row; existing: (typeof devMembers)[number] | undefined; how: string }[] = [];
for (const r of memberRows) {
  const email = str(r["メール"]).toLowerCase();
  const name = str(r["氏名"]);
  const first = name.split(/[\s　]+/)[0];
  let existing = email ? devMembers.find((m) => m.email === email) : undefined;
  let how = "メール";
  if (!existing) { existing = devMembers.find((m) => m.name === name); how = "氏名"; }
  if (!existing) { existing = devMembers.find((m) => m.name === first); how = "姓"; }
  if (!existing && str(r["権限"]) === "社長") { existing = devMembers.find((m) => m.name === "社長"); how = "社長"; }
  plan.push({ row: r, existing, how: existing ? how : "新規" });
}
console.log("\nメンバーの対応（DEVの名前は変えない。タスク等が名前でひも付いているため）");
for (const p of plan) {
  console.log(`  ${str(p.row["氏名"]).padEnd(8)} ${str(p.row["権限"]).padEnd(5)} → ${p.existing ? `DEV「${p.existing.name}」(${p.existing.type})` : "新規作成"}（${p.how}）`);
}

// ── 事業目標（期の空欄は上の行を引き継ぐ。目標が空の行は GAS版と同じく読み飛ばす）──
let lastTerm = term;
const bizRows = load("事業目標")
  .map((r, i) => {
    lastTerm = str(r["期"]) || lastTerm;
    const period = str(r["期間"]) || "年間";
    return {
      legacyId: str(r["ID"]) || `${lastTerm}-${period}`,
      term: lastTerm,
      grain: str(r["粒度"]) || (period === "年間" ? "年間" : "四半期"),
      period,
      goal: str(r["目標"]),
      kpi: orNull(r["指標(KPI)"]),
      target: orNull(r["目標値"]),
      actual: orNull(r["実績"]),
      owner: orNull(r["担当"]),
      status: orNull(r["状況"]),
      comment: orNull(r["社長コメント"]),
      sortOrder: i,
    };
  })
  .filter((b) => b.goal);
console.log(`\n事業目標 ${bizRows.length}件（${bizRows.map((b) => `${b.term}/${b.period}`).join("、")}）`);

// ── 個人目標 ──
const goalRows = load("個人目標").filter((r) => str(r["ID"]));
console.log(`個人目標 ${goalRows.length}件`);

if (!apply) {
  console.log("\n（書き込みはしていません。--apply を付けると書き込みます）");
  process.exit(0);
}

for (const [k, v] of Object.entries(setting)) {
  await prisma.appSetting.upsert({ where: { key: ROADMAP_SETTING_PREFIX + k }, update: { value: v }, create: { key: ROADMAP_SETTING_PREFIX + k, value: v } });
}

const idByEmail = new Map<string, string>();
for (const p of plan) {
  const r = p.row;
  const email = str(r["メール"]).toLowerCase() || null;
  const access = {
    email,
    permission: PERM[str(r["権限"])] ?? null,
    departments: str(r["部門"]).split(/[、,，\s]+/).filter(Boolean).join("、") || null,
    employment: str(r["在籍"]) === "退職" ? "退職" : "在籍",
  };
  const role = orNull(r["役割"]);
  const m = p.existing
    ? await prisma.member.update({ where: { id: p.existing.id }, data: { ...access, ...(role && { role }) } })
    : await prisma.member.create({ data: { name: str(r["氏名"]), type: "staff", role, ...access } });
  if (email) idByEmail.set(email, m.id);
}

const bizIdByLegacy = new Map<string, string>();
for (const b of bizRows) {
  const { legacyId, ...data } = b;
  const g = await prisma.bizGoal.upsert({ where: { legacyId }, update: data, create: { legacyId, ...data } });
  bizIdByLegacy.set(legacyId, g.id);
}

// 1回目：本体（親は後で）、2回目：親ID をつなぐ
const goalIdByLegacy = new Map<string, string>();
let skipped = 0;
for (const r of goalRows) {
  const memberId = idByEmail.get(str(r["メール"]).toLowerCase());
  if (!memberId) { skipped++; console.log("  メンバー不明のため読み飛ばし:", str(r["ID"])); continue; }
  const kind = ["年間", "四半期", "月"].includes(str(r["種別"])) ? str(r["種別"]) : "四半期";
  const month = kind === "月" ? ym(r["月"]) : null;
  const quarter = kind === "年間" ? null : month ? quarterOfMonth(month) : /^Q[1-4]$/.test(str(r["評価期間"])) ? str(r["評価期間"]) : null;
  const w = Number(str(r["ウェイト(%)"]));
  const data = {
    memberId,
    term: str(r["期"]) || term,
    kind,
    quarter,
    month,
    qtype: str(r["区分"]) === "定性" ? "定性" : "定量",
    goal: str(r["目標"]) || "（無題）",
    criteria: orNull(r["達成基準"]),
    kpi: orNull(r["指標"]),
    target: orNull(r["目標値"]),
    result: orNull(r["実績"]),
    progress: orNull(r["進捗"]),
    weight: str(r["ウェイト(%)"]) && !isNaN(w) ? Math.round(w) : null,
    selfGrade: orNull(r["本人評価"]),
    selfComment: orNull(r["本人コメント"]),
    fb: orNull(r["社長FB"]),
    ceoGrade: orNull(r["社長評価"]),
    ceoComment: orNull(r["社長コメント"]),
    status: ["設定中", "合意済", "評価中", "確定"].includes(str(r["状態"])) ? str(r["状態"]) : "設定中",
  };
  const legacyId = str(r["ID"]);
  const g = await prisma.personalGoal.upsert({ where: { legacyId }, update: data, create: { legacyId, ...data } });
  goalIdByLegacy.set(legacyId, g.id);
}
for (const r of goalRows) {
  const id = goalIdByLegacy.get(str(r["ID"]));
  const parent = goalIdByLegacy.get(str(r["親ID"])) ?? null;
  if (id) await prisma.personalGoal.update({ where: { id }, data: { parentId: parent } });
}

// 件数照合
const [mCount, bCount, gCount] = await Promise.all([
  prisma.member.count({ where: { email: { in: [...idByEmail.keys()] } } }),
  prisma.bizGoal.count({ where: { legacyId: { in: [...bizIdByLegacy.keys()] } } }),
  prisma.personalGoal.count({ where: { legacyId: { in: [...goalIdByLegacy.keys()] } } }),
]);
console.log("\n書き込み完了・件数照合（移行データ → DEV）");
console.log(`  メンバー（メールあり） ${memberRows.filter((r) => str(r["メール"])).length} → ${mCount}`);
console.log(`  事業目標 ${bizRows.length} → ${bCount}`);
console.log(`  個人目標 ${goalRows.length} → ${gCount}${skipped ? `（読み飛ばし ${skipped}）` : ""}`);
