// OEM（サーバー側専用）：設定の読み書き・OEM商品の原価と単価の状態
import { prisma } from "@/lib/db";
import { breakdownOf, loadProductWithCost } from "@/lib/product-server";
import { marginRate, normalizeOemSettings, OEM_SETTING_KEY, oemUnitCost, type OemSettings } from "@/lib/oem";

export async function getOemSettings(): Promise<OemSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: OEM_SETTING_KEY } });
  try {
    return normalizeOemSettings(row ? JSON.parse(row.value) : null);
  } catch {
    return normalizeOemSettings(null);
  }
}

export async function saveOemSettings(v: Partial<OemSettings>): Promise<OemSettings> {
  const s = normalizeOemSettings(v);
  await prisma.appSetting.upsert({
    where: { key: OEM_SETTING_KEY },
    update: { value: JSON.stringify(s) },
    create: { key: OEM_SETTING_KEY, value: JSON.stringify(s) },
  });
  return s;
}

// OEM商品の「今の原価」と、決めた単価での粗利率・値上がり
export async function oemStatus(productId: string, settings?: OemSettings) {
  const p = await loadProductWithCost(productId);
  if (!p) return null;
  const s = settings ?? (await getOemSettings());
  const b = breakdownOf(p);
  const cost = oemUnitCost(b, p.oemIncludePackaging);
  const rate = marginRate(p.oemPrice, cost);
  return {
    product: p,
    cost: {
      current: cost,
      total: Math.round(b.total),
      packagingMaterial: Math.round(b.packagingMaterialCost),
    },
    price: p.oemPrice,
    pricedCost: p.oemPricedCost,
    pricedAt: p.oemPricedAt,
    multiplier: p.oemMultiplier,
    marginRate: rate,
    costChange: p.oemPricedCost != null ? cost - p.oemPricedCost : null,
    belowMin: rate !== null && rate < s.minMarginRate,
  };
}

// OEM商品のコード（OEM-0001 から順に空いている番号）
export async function nextOemCode(): Promise<string> {
  const rows = await prisma.product.findMany({ where: { code: { startsWith: "OEM-" } }, select: { code: true } });
  const used = new Set(rows.map((r) => Number(r.code.slice(4))).filter((n) => !isNaN(n)));
  let n = 1;
  while (used.has(n)) n++;
  return `OEM-${String(n).padStart(4, "0")}`;
}
