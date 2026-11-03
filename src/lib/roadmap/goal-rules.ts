// ロードマップ：個人目標のルール（GAS版 Code.gs の saveGoal / deleteGoal / goalForViewer_ と同じ動き）
// 画面とAPIの両方で使う（DBには触らない）

export const GOAL_STATUSES = ["設定中", "合意済", "評価中", "確定"] as const;
export const GRADES = ["S", "A", "B", "C", "D"] as const;
export const PROGRESS = ["未着手", "進行中", "達成", "未達"] as const;
export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
export const GOAL_KINDS = ["年間", "四半期", "月"] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];
export type GoalKind = (typeof GOAL_KINDS)[number];

// 1Q 緑・2Q 青・3Q 橙・4Q 紫（左ボーダー＋薄い背景）
export const QUARTER_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  Q1: { label: "1Q（3〜5月）", color: "#5f8a5a", bg: "#5f8a5a12" },
  Q2: { label: "2Q（6〜8月）", color: "#3f7a9a", bg: "#3f7a9a12" },
  Q3: { label: "3Q（9〜11月）", color: "#b8692e", bg: "#b8692e12" },
  Q4: { label: "4Q（12〜2月）", color: "#6e5b94", bg: "#6e5b9412" },
};

// 期は3月始まり：3〜5月=Q1, 6〜8月=Q2, 9〜11月=Q3, 12〜2月=Q4
export function quarterOfMonth(ym: string): string {
  const m = Number(String(ym).slice(5, 7));
  return "Q" + (Math.floor(((m - 3 + 12) % 12) / 3) + 1);
}

// 期首日（YYYY-MM-DD）から12か月
export function fiscalMonths(termStart: string): { key: string; m: number }[] {
  const y = Number(termStart.slice(0, 4));
  const m0 = Number(termStart.slice(5, 7)) || 3;
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, m0 - 1 + i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, m: d.getMonth() + 1 };
  });
}

export function monthsOfQuarter(termStart: string, q: string) {
  const i = (Number(q.slice(1)) - 1) * 3;
  return fiscalMonths(termStart).slice(i, i + 3);
}

// 「600個」「1,200円」なども数として読む
export function numOf(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/[,円%件個人社h\s]/g, ""));
  return isNaN(n) ? null : n;
}

// 定量の達成率（%）。数でなければ null
export function achievement(g: { qtype: string; target: string | null; result: string | null }): number | null {
  if (g.qtype === "定性") return null;
  const t = numOf(g.target);
  const r = numOf(g.result);
  return t && r !== null ? Math.round((r / t) * 100) : null;
}

export interface GoalInput {
  kind?: string;
  quarter?: string | null;
  month?: string | null;
  parentId?: string | null;
  bizGoalId?: string | null;
  qtype?: string;
  goal?: string;
  criteria?: string | null;
  kpi?: string | null;
  target?: string | null;
  result?: string | null;
  progress?: string | null;
  weight?: number | string | null;
  selfGrade?: string | null;
  selfComment?: string | null;
  fb?: string | null;
  ceoGrade?: string | null;
  ceoComment?: string | null;
  status?: string;
}

const CONTENT = ["quarter", "month", "parentId", "bizGoalId", "qtype", "goal", "kpi", "target", "criteria", "weight"] as const;
const RESULT = ["result", "progress", "selfComment"] as const;
const CEO_ONLY = ["selfGrade", "fb", "ceoGrade", "ceoComment", "status"] as const;

// 編集できる項目だけを取り出す。できない状態なら error
export function pickEditable(
  input: GoalInput,
  ctx: { isPresident: boolean; kind: string; status: string; isNew: boolean }
): { data: GoalInput } | { error: string } {
  const data: GoalInput = {};
  const pick = (keys: readonly (keyof GoalInput)[]) => {
    for (const k of keys) if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
  };
  const { isPresident, kind, status, isNew } = ctx;

  if (isPresident) {
    pick([...CONTENT, ...RESULT, ...CEO_ONLY]);
  } else if (kind === "月") {
    // 月目標：本人がいつでも入力・更新できる（確定後は不可）
    if (status === "確定") return { error: "確定済みの目標は編集できません。" };
    pick([...CONTENT, ...RESULT]);
  } else {
    // 年間・四半期：内容は「設定中」だけ、実績・結果は確定まで、本人評価は「評価中」だけ
    if (isNew || status === "設定中") pick(CONTENT);
    if (!isNew && status !== "確定") pick(RESULT);
    if (!isNew && status === "評価中") pick(["selfGrade"]);
    if (!Object.keys(data).length) return { error: `この状態（${status}）では編集できません。` };
  }
  return { data: normalize(data) };
}

function normalize(d: GoalInput): GoalInput {
  const out: GoalInput = { ...d };
  const s = (v: unknown) => (v == null ? null : String(v).trim() || null);
  for (const k of ["criteria", "kpi", "target", "result", "selfComment", "fb", "ceoComment", "parentId", "bizGoalId"] as const) {
    if (out[k] !== undefined) out[k] = s(out[k]);
  }
  if (out.goal !== undefined) out.goal = String(out.goal || "").trim();
  if (out.month !== undefined) {
    out.month = s(out.month)?.slice(0, 7) ?? null;
    if (out.month) out.quarter = quarterOfMonth(out.month);
  }
  if (out.quarter !== undefined && out.quarter !== null && !(QUARTERS as readonly string[]).includes(out.quarter)) out.quarter = null;
  if (out.qtype !== undefined && out.qtype !== "定性") out.qtype = "定量";
  if (out.weight !== undefined) {
    const n = Number(out.weight);
    out.weight = out.weight === "" || out.weight === null || isNaN(n) ? null : Math.round(n);
  }
  for (const k of ["selfGrade", "ceoGrade"] as const) {
    if (out[k] !== undefined && !(GRADES as readonly string[]).includes(String(out[k]))) out[k] = null;
  }
  if (out.progress !== undefined && !(PROGRESS as readonly string[]).includes(String(out.progress))) out.progress = null;
  if (out.status !== undefined && !(GOAL_STATUSES as readonly string[]).includes(String(out.status))) delete out.status;
  return out;
}

// 削除できるのは「設定中」の自分の目標と、確定前の自分の月目標だけ（社長はすべて）
export function canDelete(ctx: { isPresident: boolean; own: boolean; kind: string; status: string }): boolean {
  if (ctx.isPresident) return true;
  return ctx.own && (ctx.status === "設定中" || (ctx.kind === "月" && ctx.status !== "確定"));
}

// スタッフには「確定」前の社長評価・社長コメントを送らない（社長FBはいつでも見える）
export function goalForViewer<T extends { status: string; ceoGrade: string | null; ceoComment: string | null }>(
  g: T,
  isPresident: boolean
): Omit<T, "ceoGrade" | "ceoComment"> & { ceoGrade?: string | null; ceoComment?: string | null } {
  if (isPresident || g.status === "確定") return g;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ceoGrade, ceoComment, ...rest } = g;
  return rest;
}
