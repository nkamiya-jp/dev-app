// 販売計画シミュレーションの計算（画面とAPIで共通）
// 1商品について、月ごとの生産数と、顧客カテゴリ・顧客ごとの販売数を置いて、
// 売上・販売コスト・粗利・在庫・資金の出入り（累計）を月／四半期／年で出す。
//
// 1個あたり：入金 ＝ 単価 − 販売コスト（単価×％＋1個あたりの額）／粗利 ＝ 入金 − 原価
// 資金：生産した月に「生産数×原価」が出ていき、売れた月に入金が入る → 累計がマイナスから戻る月が「回収月」

export interface ChannelCost {
  pct: number; // 単価に対する％（手数料・広告など）
  perUnit: number; // 1個あたりの額（FBA配送料・送料など）
}

export const CHANNEL_COST_KEY = "sales-channel-costs";

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

export interface PlanRow {
  key: string; // channel|contactId（顧客未定は channel|）
  channel: string;
  contactId: string | null;
  label: string;
  price: number; // 単価
  priceSource: "individual" | "auto" | "standard" | "channel" | "none";
  sellCost: number; // 1個あたりの販売コスト
  unitNet: number; // 1個あたりの入金（単価−販売コスト）
  unitGross: number; // 1個あたりの粗利（入金−原価）
  qty: Record<string, number>; // 月 → 数
}

export interface Totals {
  produced: number;
  sold: number;
  revenue: number;
  sellCost: number;
  gross: number;
  productionCost: number; // 生産の支払い
  cash: number; // 入金 − 生産の支払い
}

export interface MonthResult extends Totals {
  month: string;
  stock: number; // 月末の在庫（累計の生産 − 累計の販売）
  cumulativeCash: number;
}

const zero = (): Totals => ({ produced: 0, sold: 0, revenue: 0, sellCost: 0, gross: 0, productionCost: 0, cash: 0 });
const add = (a: Totals, b: Totals): Totals => ({
  produced: a.produced + b.produced,
  sold: a.sold + b.sold,
  revenue: a.revenue + b.revenue,
  sellCost: a.sellCost + b.sellCost,
  gross: a.gross + b.gross,
  productionCost: a.productionCost + b.productionCost,
  cash: a.cash + b.cash,
});

export function computePlan(input: { months: string[]; cost: number; production: Record<string, number>; rows: PlanRow[]; openingStock?: number }) {
  const { months, cost, production, rows } = input;
  // 期首の在庫はすでに作ってある分：在庫には入るが、生産の支払い（資金の出）は無い
  let stock = input.openingStock || 0;
  let cum = 0;
  const monthly: MonthResult[] = months.map((m) => {
    const t = zero();
    t.produced = production[m] || 0;
    t.productionCost = t.produced * cost;
    for (const r of rows) {
      const q = r.qty[m] || 0;
      if (!q) continue;
      t.sold += q;
      t.revenue += q * r.price;
      t.sellCost += q * r.sellCost;
      t.gross += q * r.unitGross;
    }
    t.cash = t.revenue - t.sellCost - t.productionCost;
    stock += t.produced - t.sold;
    cum += t.cash;
    return { month: m, ...t, stock, cumulativeCash: cum };
  });

  const quarters = [0, 1, 2, 3].map((i) => {
    const ms = monthly.slice(i * 3, i * 3 + 3);
    const t = ms.reduce((a, b) => add(a, b), zero());
    const last = ms[ms.length - 1];
    return { quarter: `Q${i + 1}`, ...t, stock: last?.stock ?? 0, cumulativeCash: last?.cumulativeCash ?? 0 };
  });
  const year = { ...monthly.reduce((a, b) => add(a, b), zero()), stock, cumulativeCash: cum };

  // 回収月：累計がマイナスになったあと、0以上に戻った最初の月
  let wentNegative = false;
  let payback: string | null = null;
  for (const r of monthly) {
    if (r.cumulativeCash < 0) wentNegative = true;
    else if (wentNegative && !payback) payback = r.month;
  }
  const lowest = monthly.reduce((a, r) => Math.min(a, r.cumulativeCash), 0);

  // 行ごとの年計
  const rowTotals = rows.map((r) => {
    const q = months.reduce((a, m) => a + (r.qty[m] || 0), 0);
    return { key: r.key, qty: q, revenue: q * r.price, gross: q * r.unitGross };
  });

  return {
    monthly,
    quarters,
    year,
    payback,
    lowestCash: lowest,
    stockShortMonth: monthly.find((r) => r.stock < 0)?.month ?? null, // 作った数より多く売る月
    rowTotals,
    grossRate: year.revenue > 0 ? Math.round((year.gross / year.revenue) * 1000) / 10 : null,
  };
}

// 1か月の在庫の振り分け：売れる上限の中で、単価（売上重視）か1個の粗利（粗利重視）の高いカテゴリから順に割り当てる
export interface AllocChannel { key: string; price: number; unitGross: number; cap: number }

export function allocateStock(stock: number, channels: AllocChannel[], mode: "revenue" | "gross") {
  const order = [...channels].sort((a, b) => (mode === "revenue" ? b.price - a.price : b.unitGross - a.unitGross));
  let left = Math.max(0, stock);
  const qty: Record<string, number> = {};
  for (const c of order) {
    const q = Math.min(left, Math.max(0, c.cap));
    if (q > 0) qty[c.key] = q;
    left -= q;
  }
  const revenue = channels.reduce((a, c) => a + (qty[c.key] || 0) * c.price, 0);
  const gross = channels.reduce((a, c) => a + (qty[c.key] || 0) * c.unitGross, 0);
  return { qty, revenue, gross, sold: Math.max(0, stock) - left, left };
}
