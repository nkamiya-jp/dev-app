// ロードマップ 段階3（ホーム・掲示板・会社カレンダー・事業目標）の共通ルール。画面とAPIの両方で使う（DBには触らない）

export const BIZ_STATUSES = ["未着手", "進行中", "達成", "未達"] as const;
export const BIZ_PERIODS = ["年間", "Q1", "Q2", "Q3", "Q4"] as const;

// 会社カレンダーの区分と色（推測：GAS版の区分名がわかったら合わせる）
export const EVENT_CATEGORIES: { id: string; color: string }[] = [
  { id: "休業日", color: "#dc2626" },
  { id: "行事", color: "#2563eb" },
  { id: "展示会", color: "#9333ea" },
  { id: "締め", color: "#d97706" },
  { id: "面談", color: "#0d9488" },
  { id: "その他", color: "#6b7280" },
];
export const EVENT_VISIBILITY = ["全員", "社長のみ"] as const;

export function eventColor(category: string | null | undefined): string {
  return EVENT_CATEGORIES.find((c) => c.id === category)?.color ?? "#6b7280";
}

export const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isYm = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);

// 文字列の欄を「空なら null」にそろえる
export function textOrNull(v: unknown): string | null {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s || null;
}

// YYYY-MM-DD に日数を足す（日本時間の日付として扱う）
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
export function weekdayJa(ymd: string): string {
  return WEEK[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
}

// 「11/24(月)」「11/24(月)〜11/26(水)」
export function formatEventDate(start: string, end?: string | null): string {
  const one = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}(${weekdayJa(s)})`;
  return end && end !== start ? `${one(start)}〜${one(end)}` : one(start);
}

// 期間 [from, to] と重なる予定か
export function overlaps(e: { startDate: string; endDate: string | null }, from: string, to: string): boolean {
  const end = e.endDate || e.startDate;
  return e.startDate <= to && end >= from;
}

// 事業目標・月目標の実績を、その人が入れてよいか（社長は全部。スタッフ・パートは自部門の行の実績・コメント・状況だけ）
export function canEditDept(v: { isPresident: boolean; departments: string[] }, dept: string | null | undefined): boolean {
  if (v.isPresident) return true;
  return !!dept && v.departments.includes(dept);
}

// 社長以外が月目標で直せる欄
export const MONTH_GOAL_DEPT_FIELDS = ["actual", "ownerComment", "status"] as const;
// 社長以外が事業目標（担当＝自部門）で直せる欄
export const BIZ_GOAL_DEPT_FIELDS = ["actual", "status"] as const;

// 会社カレンダーの入力チェック（API で使う）
export function parseEvent(b: Record<string, unknown>) {
  const startDate = String(b.startDate ?? "");
  const endDate = textOrNull(b.endDate);
  const title = String(b.title ?? "").trim();
  if (!isYmd(startDate)) return { error: "開始日を選んでください。" };
  if (endDate && (!isYmd(endDate) || endDate < startDate)) return { error: "終了日は開始日以降にしてください。" };
  if (!title) return { error: "タイトルを入力してください。" };
  const visibility = (EVENT_VISIBILITY as readonly string[]).includes(String(b.visibility)) ? String(b.visibility) : "全員";
  return {
    data: {
      startDate,
      endDate: endDate && endDate !== startDate ? endDate : null,
      title,
      category: textOrNull(b.category),
      detail: textOrNull(b.detail),
      visibility,
    },
  };
}

// 事業目標の「担当」（自由文。例：「営業」「制作・出荷」「神谷」）に、その人の部門か名前が入っているか
export function canEditBizOwner(v: { isPresident: boolean; departments: string[]; name: string }, owner: string | null | undefined): boolean {
  if (v.isPresident) return true;
  const o = String(owner || "");
  if (!o) return false;
  return v.departments.some((d) => o.includes(d)) || (!!v.name && o.includes(v.name));
}

// body から、許された欄だけを取り出す（文字列の欄は空なら null）
export function pickFields<K extends string>(b: Record<string, unknown>, keys: readonly K[]): Partial<Record<K, string | null>> {
  const out: Partial<Record<K, string | null>> = {};
  for (const k of keys) if (b[k] !== undefined) out[k] = textOrNull(b[k]);
  return out;
}
