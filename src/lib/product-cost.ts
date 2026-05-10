// 商品原価の計算ロジック

export interface CostStep {
  id: string;
  step: string;
  unitCost: number;
}

export interface Material {
  id: string;
  name: string;
  category: string; // "fabric" | "other"
  unitPrice: number;
  unitType: string; // "meter" | "piece" | "set"
  yieldCount: number;
}

export interface ProductCostInput {
  salesCost?: number | null;
  packagingCost?: number | null;
  costSteps?: CostStep[];
  materials?: Material[];
}

export interface CostBreakdown {
  salesCost: number;
  packagingCost: number;
  productionCost: number; // 制作代金合計
  fabricCost: number; // 生地代金合計
  otherMaterialCost: number; // その他資材費合計
  total: number; // 1個あたり原価
  // 詳細
  stepBreakdown: { step: string; cost: number }[];
  materialBreakdown: { name: string; perPiece: number; category: string }[];
}

export function calcMaterialPerPiece(m: Material): number {
  if (!m.yieldCount || m.yieldCount <= 0) return 0;
  return m.unitPrice / m.yieldCount;
}

export function calcCostBreakdown(input: ProductCostInput): CostBreakdown {
  const salesCost = input.salesCost ?? 0;
  const packagingCost = input.packagingCost ?? 0;

  const stepBreakdown = (input.costSteps ?? []).map((s) => ({
    step: s.step,
    cost: s.unitCost,
  }));
  const productionCost = stepBreakdown.reduce((s, x) => s + x.cost, 0);

  const materialBreakdown = (input.materials ?? []).map((m) => ({
    name: m.name,
    perPiece: calcMaterialPerPiece(m),
    category: m.category,
  }));
  const fabricCost = materialBreakdown
    .filter((m) => m.category === "fabric")
    .reduce((s, m) => s + m.perPiece, 0);
  const otherMaterialCost = materialBreakdown
    .filter((m) => m.category !== "fabric")
    .reduce((s, m) => s + m.perPiece, 0);

  const total = salesCost + packagingCost + productionCost + fabricCost + otherMaterialCost;

  return {
    salesCost,
    packagingCost,
    productionCost,
    fabricCost,
    otherMaterialCost,
    total,
    stepBreakdown,
    materialBreakdown,
  };
}

export function calcGrossProfit(cost: number, sellPrice: number) {
  const profit = sellPrice - cost;
  const rate = sellPrice > 0 ? (profit / sellPrice) * 100 : 0;
  return { profit, rate };
}

// デフォルト原価率: 30% = 0.30
// 上代 = 原価 / 原価率
export const DEFAULT_COST_RATIO = 0.30;

export function calcRetailFromCost(cost: number, costRatio: number = DEFAULT_COST_RATIO): number {
  if (costRatio <= 0) return 0;
  return Math.round(cost / costRatio);
}

// 卸価格 = 上代 × 卸率
export function calcWholesalePrice(retail: number, wholesaleRate: number): number {
  return Math.round(retail * wholesaleRate);
}

// 標準掛率パターン
export const WHOLESALE_RATES = [0.50, 0.45, 0.40, 0.38];

export interface PriceRow {
  rate: number; // 0.50 など
  ratePct: number; // 50
  wholesalePrice: number;
  profit: number;
  profitRate: number; // 卸価格に対する粗利率 %
}

export function buildPriceMatrix(retail: number, cost: number, rates: number[] = WHOLESALE_RATES): PriceRow[] {
  return rates.map((rate) => {
    const wholesalePrice = calcWholesalePrice(retail, rate);
    const profit = wholesalePrice - cost;
    const profitRate = wholesalePrice > 0 ? (profit / wholesalePrice) * 100 : 0;
    return { rate, ratePct: Math.round(rate * 100), wholesalePrice, profit, profitRate };
  });
}
