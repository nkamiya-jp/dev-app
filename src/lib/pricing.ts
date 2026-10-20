// 価格計算（上代・取引タイプ別の販売価格・粗利）の設定と計算式

export interface ChannelFee {
  feeRate: number;   // 手数料率 %（販売価格に対する。例: 15 = 15%）
  fixedCost: number; // 1個あたり固定費 円（FBA手数料・送料・関税など）
}

export interface PricingSettings {
  channelFees: Record<string, ChannelFee>; // 取引タイプid → 経費
  taxRate: number;          // 消費税率 %
  targetMarginPct: number;  // 目標粗利率 %（上代逆算の初期値）
  roundUnit: number;        // 逆算上代の切り上げ単位（10 or 100）
  marginRedBelow: number;   // 粗利率がこれ未満なら赤 %
  marginYellowBelow: number; // 粗利率がこれ未満なら黄 %
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  channelFees: {},
  taxRate: 10,
  targetMarginPct: 30,
  roundUnit: 100,
  marginRedBelow: 30,
  marginYellowBelow: 40,
};

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// 保存値（部分的・古い形式でも可）を完全な設定に正規化
export function normalizePricingSettings(raw: unknown): PricingSettings {
  const d = DEFAULT_PRICING_SETTINGS;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fees: Record<string, ChannelFee> = {};
  if (r.channelFees && typeof r.channelFees === "object") {
    for (const [id, f] of Object.entries(r.channelFees as Record<string, Record<string, unknown>>)) {
      fees[id] = { feeRate: num(f?.feeRate, 0), fixedCost: num(f?.fixedCost, 0) };
    }
  }
  return {
    channelFees: fees,
    taxRate: num(r.taxRate, d.taxRate),
    targetMarginPct: num(r.targetMarginPct, d.targetMarginPct),
    roundUnit: num(r.roundUnit, d.roundUnit) === 10 ? 10 : 100,
    marginRedBelow: num(r.marginRedBelow, d.marginRedBelow),
    marginYellowBelow: num(r.marginYellowBelow, d.marginYellowBelow),
  };
}

export function getChannelFee(s: PricingSettings, typeId: string): ChannelFee {
  return s.channelFees[typeId] ?? { feeRate: 0, fixedCost: 0 };
}

export interface ChannelPrice {
  price: number;   // 販売価格（円・整数）
  fee: number;     // 手数料（円・整数）
  fixedCost: number;
  profit: number;  // 粗利（円・整数）
  profitRate: number; // 粗利率 %（表示時に小数1桁）
}

// 粗利 = 販売価格 −（販売価格×手数料率）− 1個あたり固定費 − 原価
// 金額はすべて円単位に丸めてから計算する（表示と合計が食い違わないように）
export function calcChannelPrice(retail: number, ratePct: number, cost: number, fee: ChannelFee): ChannelPrice {
  const price = Math.round((retail * ratePct) / 100);
  const feeYen = Math.round((price * fee.feeRate) / 100);
  const fixedCost = Math.round(fee.fixedCost);
  const profit = price - feeYen - fixedCost - Math.round(cost);
  const profitRate = price > 0 ? (profit / price) * 100 : 0;
  return { price, fee: feeYen, fixedCost, profit, profitRate };
}

// 目標粗利率を確保できる上代（切り上げ前）。
// 販売価格 P = 上代 × 掛率 で、P(1−手数料率) − 固定費 − 原価 ≥ 目標粗利率×P を満たす最小の上代
//   → P = (原価＋固定費) ÷ (1 − 手数料率 − 目標粗利率)、上代 = P ÷ 掛率
// 手数料なしなら 上代 = 原価 ÷（掛率 ×（1 − 目標粗利率））
export function calcRetailForTargetMargin(cost: number, ratePct: number, targetMarginPct: number, fee: ChannelFee): number | null {
  const denom = 1 - fee.feeRate / 100 - targetMarginPct / 100;
  if (ratePct <= 0 || denom <= 0) return null;
  return (Math.round(cost) + fee.fixedCost) / denom / (ratePct / 100);
}

export function ceilTo(value: number, unit: number): number {
  return Math.ceil(value / unit) * unit;
}

export function withTax(price: number, taxRate: number): number {
  return Math.round(price * (1 + taxRate / 100));
}

export function marginTone(profitRate: number, s: PricingSettings): "red" | "yellow" | "ok" {
  if (profitRate < s.marginRedBelow) return "red";
  if (profitRate < s.marginYellowBelow) return "yellow";
  return "ok";
}
