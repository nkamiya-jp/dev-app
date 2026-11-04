// OEM価格の計算（画面とAPIで共通）
// OEM単価 ＝ 原価（制作費・販管費込み。梱包資材は既定で除く）× 倍率（普段の注文量で決めて固定）
import type { CostBreakdown } from "@/lib/product-cost";

export interface OemSettings {
  standardMultiplier: number; // 標準の倍率
  bulkMultiplier: number; // 大口の倍率
  bulkQuantity: number; // この数量以上を大口とみなす
  minMarginRate: number; // 粗利率（%）がこれを下回ったら知らせる
}

export const OEM_DEFAULTS: OemSettings = {
  standardMultiplier: 1.5,
  bulkMultiplier: 1.4,
  bulkQuantity: 500,
  minMarginRate: 25,
};

export const OEM_SETTING_KEY = "oem-settings";

export function normalizeOemSettings(v: Partial<OemSettings> | null | undefined): OemSettings {
  const n = (x: unknown, d: number) => (typeof x === "number" && isFinite(x) && x > 0 ? x : d);
  return {
    standardMultiplier: n(v?.standardMultiplier, OEM_DEFAULTS.standardMultiplier),
    bulkMultiplier: n(v?.bulkMultiplier, OEM_DEFAULTS.bulkMultiplier),
    bulkQuantity: Math.round(n(v?.bulkQuantity, OEM_DEFAULTS.bulkQuantity)),
    minMarginRate: n(v?.minMarginRate, OEM_DEFAULTS.minMarginRate),
  };
}

// OEMの原価：合計原価から梱包資材費を除く（含める設定なら合計原価のまま）。円単位に丸める
export function oemUnitCost(b: Pick<CostBreakdown, "total" | "packagingMaterialCost">, includePackaging: boolean): number {
  return Math.round(b.total - (includePackaging ? 0 : b.packagingMaterialCost));
}

export function multiplierFor(quantity: number, s: OemSettings): number {
  return quantity >= s.bulkQuantity ? s.bulkMultiplier : s.standardMultiplier;
}

// 単価は10円単位に切り上げ
export function oemUnitPrice(unitCost: number, multiplier: number): number {
  return Math.ceil((unitCost * multiplier) / 10) * 10;
}

// 粗利率（%・小数1桁）
export function marginRate(price: number | null | undefined, cost: number): number | null {
  if (!price || price <= 0) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

export interface OemExtra {
  label: string;
  amount: number;
}

export function parseExtras(v: string | null | undefined): OemExtra[] {
  try {
    const a = JSON.parse(v || "[]");
    return Array.isArray(a)
      ? a.map((x) => ({ label: String(x?.label || "").trim(), amount: Math.round(Number(x?.amount) || 0) })).filter((x) => x.label || x.amount)
      : [];
  } catch {
    return [];
  }
}
