// 商品原価の計算ロジック

export interface CostStep {
  id: string;
  step: string;
  unitCost: number;     // 内製: 1ショットあたりの単価 / 外注: 総額 / 通常: 単価
  quantity?: number;    // 内製のショット数（外注/通常は 1）
  category?: string;    // "制作費" | "裁断費"
  subType?: string | null; // "内製" | "外注"
}

// 1個あたりのコスト寄与（subType と quantity を考慮）
export function effectiveStepCost(s: CostStep): number {
  const q = s.quantity ?? 1;
  return s.unitCost * q;
}

export interface Material {
  id: string;
  name: string;
  category: string; // leaf カテゴリ名 例: 表地, 口金, 梱包資材
  unitPrice: number;
  unitType: string; // "meter" | "piece" | "set"
  yieldCount: number;    // [生地] 使用Mから取れる個数
  usedMeters?: number;   // [生地] 使用M数（例: 0.9）
  usageCount?: number;   // [資材/梱包資材] 1個あたりの使用数（例: ボタン2個）
  topCategory?: string; // 大分類: "生地費" | "資材費" | "梱包資材費" など（API側で展開）
}

export interface ProductCostInput {
  salesCost?: number | null;     // 営業費（運賃含む）
  outboundCost?: number | null;  // 出荷費（梱包含む）
  mgmtCost?: number | null;      // 管理費
  // [legacy] 統合済みフィールド（後方互換のため受けるが、通常 null）
  packagingCost?: number | null;
  shippingCost?: number | null;
  costSteps?: CostStep[];
  materials?: Material[];
}

export interface CostBreakdown {
  // 労務費 = 営業費 + 出荷費 + 管理費（legacy分も合算）
  laborCost: number;
  // 内訳
  salesCost: number;
  packagingCost: number;
  shippingCost: number;
  outboundCost: number;
  mgmtCost: number;

  // 各大分類
  productionCost: number;   // 制作費（制作費カテゴリの工程合計）
  cuttingCost: number;      // 裁断費（裁断費カテゴリの工程合計）
  fabricCost: number;       // 生地費（表地・裏地・芯材）
  materialCost: number;     // 資材費（留め具・資材）
  packagingMaterialCost: number; // 梱包資材費

  total: number; // 合計原価
  // 詳細
  stepBreakdown: { step: string; cost: number; category: string }[];
  materialBreakdown: { name: string; perPiece: number; category: string; topCategory: string }[];
}

export function calcMaterialPerPiece(m: Material): number {
  const top = resolveTopCategory(m);
  if (top === "生地費") {
    // 生地: 単価 × 使用M ÷ 取れ数
    if (!m.yieldCount || m.yieldCount <= 0) return 0;
    return (m.unitPrice * (m.usedMeters ?? 1)) / m.yieldCount;
  }
  // 資材・梱包資材: 単価 × 使用数
  return m.unitPrice * (m.usageCount ?? 1);
}

// 大分類の判定（leaf カテゴリ → top カテゴリ名）
// API 側で topCategory がセットされていなければ、ここで簡易フォールバック
const FABRIC_LEAVES = new Set(["fabric", "生地", "表地", "裏地", "芯材"]);
const PACKAGING_LEAVES = new Set(["梱包資材"]);
const KNOWN_TOPS = new Set(["生地費", "資材費", "梱包資材費"]);
function resolveTopCategory(m: Material): string {
  // topCategory が正規の大分類ならそれを使う（旧名の取り残しは無視してフォールバック）
  if (m.topCategory && KNOWN_TOPS.has(m.topCategory)) return m.topCategory;
  if (FABRIC_LEAVES.has(m.category)) return "生地費";
  if (PACKAGING_LEAVES.has(m.category)) return "梱包資材費";
  return "資材費";
}

export function calcCostBreakdown(input: ProductCostInput): CostBreakdown {
  const salesCost = input.salesCost ?? 0;
  const packagingCost = input.packagingCost ?? 0;
  const shippingCost = input.shippingCost ?? 0;
  const outboundCost = input.outboundCost ?? 0;
  const mgmtCost = input.mgmtCost ?? 0;
  const laborCost = salesCost + packagingCost + shippingCost + outboundCost + mgmtCost;

  const stepBreakdown = (input.costSteps ?? []).map((s) => ({
    step: s.step,
    cost: effectiveStepCost(s),  // 内製は quantity × unitCost、外注は unitCost
    category: s.category || "制作費",
  }));
  const productionCost = stepBreakdown.filter((s) => s.category === "制作費").reduce((s, x) => s + x.cost, 0);
  const cuttingCost   = stepBreakdown.filter((s) => s.category === "裁断費").reduce((s, x) => s + x.cost, 0);

  const materialBreakdown = (input.materials ?? []).map((m) => ({
    name: m.name,
    perPiece: calcMaterialPerPiece(m),
    category: m.category,
    topCategory: resolveTopCategory(m),
  }));
  const fabricCost           = materialBreakdown.filter((m) => m.topCategory === "生地費").reduce((s, m) => s + m.perPiece, 0);
  const materialCost         = materialBreakdown.filter((m) => m.topCategory === "資材費").reduce((s, m) => s + m.perPiece, 0);
  const packagingMaterialCost= materialBreakdown.filter((m) => m.topCategory === "梱包資材費").reduce((s, m) => s + m.perPiece, 0);

  const total = laborCost + productionCost + cuttingCost + fabricCost + materialCost + packagingMaterialCost;

  return {
    laborCost,
    salesCost,
    packagingCost,
    shippingCost,
    outboundCost,
    mgmtCost,
    productionCost,
    cuttingCost,
    fabricCost,
    materialCost,
    packagingMaterialCost,
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
