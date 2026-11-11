// 月の収支計画（画面とAPIで共通）
// 月ごとに「必要売上（黒字化のライン）」に対して、今見えている売上（受注済み・見込み）がいくら足りないかを出し、
// 不足をどのカテゴリ・どの顧客の「攻め」で埋めるか、生産・仕入の現実と合わせて調整する。

export interface ChannelCost {
  pct: number; // 単価に対する％（手数料・広告など）
  perUnit: number; // 1個あたりの額（FBA配送料・送料など）
}

export const CHANNEL_COST_KEY = "sales-channel-costs";
export const MONTHLY_OVERRIDES_KEY = "monthly-plan-overrides";

export function normalizeChannelCosts(v: unknown): Record<string, ChannelCost> {
  const out: Record<string, ChannelCost> = {};
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, Partial<ChannelCost>>)) {
      const pct = Number(x?.pct) || 0;
      const perUnit = Math.round(Number(x?.perUnit) || 0);
      if (pct || perUnit) out[k] = { pct: Math.max(0, pct), perUnit: Math.max(0, perUnit) };
    }
  }
  return out;
}

export function sellingCostPerUnit(price: number, c: ChannelCost | undefined): number {
  if (!c) return 0;
  return Math.round((price * c.pct) / 100 + c.perUnit);
}

// 期（第N期）の12か月。基準の期と期首日（ロードマップの設定）からずらして求める
export function termMonths(term: string, base: { term: string; termStart: string }): string[] {
  const n = Number(term.match(/\d+/)?.[0]);
  const bn = Number(base.term.match(/\d+/)?.[0]);
  const y0 = Number(base.termStart.slice(0, 4)) + (isNaN(n) || isNaN(bn) ? 0 : n - bn);
  const m0 = Number(base.termStart.slice(5, 7)) || 3;
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y0, m0 - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

// 月ごとの手入力（空なら自動）
export interface MonthOverride {
  requiredSales?: number | null; // 必要売上を直接決める
  purchase?: number | null; // 仕入（確定した仕入・見込み）
  ad?: number | null; // 広告費
}

// 必要売上（ロードマップの営業成績と同じ考え方）
//   仕入が確定（手入力）：必要売上 ＝ 仕入 ＋ 固定費（広告を除く）＋ 広告費
//   仕入がまだ：目安 ＝（固定費 ＋ 広告費）÷ 粗利率（1 − 仕入率目標）
//   この計画の生産から出す仕入は会社全体の仕入の一部なので、目安を下回るときは目安を使う（計画に入れた分だけで必要売上が下がらないように）
export function requiredSales(input: {
  fixed: number; ad: number; purchase: number; grossRate: number; purchaseIsManual: boolean; override?: number | null;
}) {
  const { fixed, ad, purchase, grossRate, purchaseIsManual, override } = input;
  if (override != null && override > 0) return { amount: Math.round(override), basis: "手入力" };
  if (purchaseIsManual) return { amount: Math.round(purchase + fixed + ad), basis: "仕入（手入力）＋固定費＋広告費" };
  const rough = grossRate > 0 ? Math.round((fixed + ad) / grossRate) : 0;
  const fromPlan = Math.round(purchase + fixed + ad);
  return purchase > 0 && fromPlan > rough
    ? { amount: fromPlan, basis: "仕入（この計画の生産）＋固定費＋広告費" }
    : { amount: rough, basis: "目安（固定費＋広告費）÷粗利率" };
}
