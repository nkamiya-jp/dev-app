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
  yieldCount: number;    // [生地] 取れ数＝使用Mから取れるパーツ枚数（商品ごとの実測値・手入力）
  usedMeters?: number;   // [生地] 使用M＝一度に使う生地の長さ（商品×生地ごとに手入力）
  usageCount?: number;   // [生地] 1個に使うパーツ枚数 / [資材] 1個あたりの使用数
  fabricWidth?: number | null; // [生地] 生地巾 cm（表示用）
  topCategory?: string; // 大分類: "生地費" | "資材費" | "梱包資材費" など（API側で展開）
}

export interface ProductCostInput {
  salesCost?: number | null;     // 営業費（運賃含む）
  outboundCost?: number | null;  // 出荷費（梱包含む）
  mgmtCost?: number | null;      // 管理費
  purchaseCost?: number | null;  // 仕入単価（仕入品のみ。個あたりの仕入原価）
  isPurchase?: boolean;          // 仕入品なら true。原価 = 仕入単価 ＋ 販管費 のみ（製造原価は無視）
  // [legacy] 統合済みフィールド（後方互換のため受けるが、通常 null）
  packagingCost?: number | null;
  shippingCost?: number | null;
  // 裁断寸法（裁断計算ページで使用。生地費の計算には使わない）
  cutHeight?: number | null;   // 裁断 縦 cm
  cutWidth?: number | null;    // 裁断 横 cm
  usedMeters?: number | null;  // 生地の使用M（商品レベル）
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
  purchaseCost: number;     // 仕入原価（仕入品のみ）

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

  const materialBreakdown = (input.materials ?? []).map((m) => {
    const top = resolveTopCategory(m);
    let perPiece: number;
    if (top === "生地費") {
      // 取れ数・使用Mとも商品×生地ごとの実測値（手入力）。
      // 柄合わせ・地の目・ロスがあるため自動計算はしない。
      const yieldCount = m.yieldCount || 0;
      const usedMeters = m.usedMeters ?? 1;
      // 生地費 = 単価 × 使用M ÷ 取れ数 × 使用数
      //   単価×使用M = 一度に仕入れる生地の金額 / ÷取れ数 = パーツ1枚あたり / ×使用数 = 商品1個あたり
      perPiece = yieldCount > 0 ? (m.unitPrice * usedMeters) / yieldCount * (m.usageCount ?? 1) : 0;
    } else {
      // 資材・梱包資材 = 単価 × 使用数
      perPiece = m.unitPrice * (m.usageCount ?? 1);
    }
    return { name: m.name, perPiece, category: m.category, topCategory: top };
  });
  // 仕入品は製造原価（制作・裁断・生地・資材・梱包）を原価に含めない。
  // 過去に製造品だった商品を仕入に変えても、残った工程・資材が二重計上されないようにする。
  const mfgMul = input.isPurchase ? 0 : 1;
  const fabricCost           = mfgMul * materialBreakdown.filter((m) => m.topCategory === "生地費").reduce((s, m) => s + m.perPiece, 0);
  const materialCost         = mfgMul * materialBreakdown.filter((m) => m.topCategory === "資材費").reduce((s, m) => s + m.perPiece, 0);
  const packagingMaterialCost= mfgMul * materialBreakdown.filter((m) => m.topCategory === "梱包資材費").reduce((s, m) => s + m.perPiece, 0);
  const productionCostEff = mfgMul * productionCost;
  const cuttingCostEff    = mfgMul * cuttingCost;

  // 仕入品の仕入原価（仕入品以外は通常 null で 0）
  const purchaseCost = input.purchaseCost ?? 0;

  const total = laborCost + productionCostEff + cuttingCostEff + fabricCost + materialCost + packagingMaterialCost + purchaseCost;

  return {
    laborCost,
    salesCost,
    packagingCost,
    shippingCost,
    outboundCost,
    mgmtCost,
    productionCost: productionCostEff,
    cuttingCost: cuttingCostEff,
    fabricCost,
    materialCost,
    packagingMaterialCost,
    purchaseCost,
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
