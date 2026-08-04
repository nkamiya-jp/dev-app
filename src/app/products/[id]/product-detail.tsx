"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import { Trash2, Plus, Pencil, Save, X, Link2, BookOpen, Check } from "lucide-react";
import { PRODUCT_SERIES, getSeriesLabel, getSeriesColor } from "@/lib/product-meta";
import {
  calcCostBreakdown,
  calcGrossProfit,
  calcRetailFromCost,
  DEFAULT_COST_RATIO,
} from "@/lib/product-cost";
import { getAllMatrixRows } from "@/lib/contact-meta";

interface MasterMaterial {
  id: string;
  code: string | null;
  name: string;
  category: string;
  unitPrice: number;
  unitType: string;
  fabricWidth: number | null;
  fabricLength: number | null;
  active: boolean;
}

interface CostStep {
  id: string;
  step: string;
  unitCost: number;
  quantity: number;          // 内製ショット数 / 通常は1
  category: string;          // "制作費" | "裁断費"
  subType: string | null;    // "内製" | "外注"
  sortOrder: number;
  note: string | null;
}

interface Material {
  id: string;
  materialId: string | null;
  name: string;
  category: string;       // leaf カテゴリ名（表地, 口金, 梱包資材 など）
  topCategory?: string;   // 大分類（生地費, 資材費, 梱包資材費）
  unitPrice: number;
  unitType: string;
  yieldCount: number;     // [生地] 使用Mから取れる個数
  usedMeters: number;     // [生地] 使用M数
  usageCount: number;     // [資材/梱包資材] 1個あたり使用数
  cutH?: number | null;   // [生地] 裁断 縦 cm（記録用）
  cutW?: number | null;   // [生地] 裁断 横 cm（記録用）
  cutType?: string | null; // [生地] 裁断方法 型抜/手裁断
  fabricWidth?: number | null;  // 連動した資材マスタの巾（生地）
  fabricLength?: number | null; // 連動した資材マスタの尺（生地）
  sortOrder: number;
  note: string | null;
}

interface Product {
  id: string;
  code: string;
  name: string;
  series: string | null;
  size: string | null;
  retailPrice: number | null;
  costRatio: number | null;
  wholesalePrice: number | null;
  workerCost: number | null;
  salesCost: number | null;
  packagingCost: number | null;
  shippingCost: number | null;
  outboundCost: number | null;
  mgmtCost: number | null;
  purchaseCost: number | null;
  cutHeight: number | null;
  cutWidth: number | null;
  usedMeters: number | null;
  sizeW: number | null;
  sizeH: number | null;
  sizeD: number | null;
  weightG: number | null;
  leadText: string | null;
  tags: string | null;
  description: string | null;
  shortName: string | null;
  fnsku: string | null;
  hasNonwoven: boolean;
  active: boolean;
  costSteps: CostStep[];
  materials: Material[];
  inventory?: { stock: number } | null;
}

const UNIT_TYPES = [
  { id: "piece", label: "個" },
  { id: "meter", label: "m" },
  { id: "set", label: "セット" },
];

// 制作費の固定工程（自社製造品で共通）
const PRODUCTION_STEPS = ["口金", "貼り", "縫製", "その他"] as const;

export function ProductDetail({ productId }: { productId: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [editBasic, setEditBasic] = useState(false);
  type PickerGroup = "生地費" | "資材費" | "梱包資材費";
  const [pickerCategory, setPickerCategory] = useState<PickerGroup | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/products/${productId}`);
    setProduct(await res.json());
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!product) return <div className="p-6 text-gray-400">読み込み中...</div>;

  // 原価計算
  const breakdown = calcCostBreakdown({
    salesCost: product.salesCost,
    packagingCost: product.packagingCost,
    shippingCost: product.shippingCost,
    outboundCost: product.outboundCost,
    mgmtCost: product.mgmtCost,
    purchaseCost: product.purchaseCost,
    isPurchase: product.series === "purchase",
    cutHeight: product.cutHeight,
    cutWidth: product.cutWidth,
    usedMeters: product.usedMeters,
    costSteps: product.costSteps,
    materials: product.materials,
  });
  const sellPrice = product.wholesalePrice ?? 0;
  const { profit, rate } = calcGrossProfit(breakdown.total, sellPrice);
  // 仕入品は「仕入単価＋販管費」だけ。制作・裁断・生地・資材・梱包の内訳UIは出さない
  const isPurchase = product.series === "purchase";

  // 上代と卸価格マトリクス（顧客タイプ別の掛率を使用）
  const cost = breakdown.total;
  const costRatio = product.costRatio ?? DEFAULT_COST_RATIO;
  const retail = product.retailPrice ?? 0;
  const actualCostRatio = retail > 0 ? cost / retail : 0;
  const matrixRows = retail > 0 ? getAllMatrixRows().map((r) => {
    const price = Math.round(retail * r.ratePct / 100);
    const profit = price - cost;
    const profitRate = price > 0 ? (profit / price) * 100 : 0;
    return { ...r, price, profit, profitRate };
  }) : [];
  const suggestedRetail = calcRetailFromCost(cost, costRatio);

  async function saveBasic(data: Partial<Product>) {
    await fetch(`/api/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditBasic(false);
    load();
  }

  async function addStep(category: "制作費" | "裁断費" = "制作費", subType: "内製" | "外注" | null = null) {
    const body: Record<string, unknown> = { productId, category };
    if (subType === "内製") {
      Object.assign(body, { step: "内製 裁断", subType, unitCost: 5, quantity: 1 });
    } else if (subType === "外注") {
      Object.assign(body, { step: "外注 裁断", subType, unitCost: 0, quantity: 1 });
    } else {
      Object.assign(body, { step: category === "裁断費" ? "新裁断" : "新工程", unitCost: 0, quantity: 1 });
    }
    await fetch("/api/products/cost-steps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  async function updateStep(id: string, data: Partial<CostStep>) {
    await fetch("/api/products/cost-steps", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    load();
  }

  async function deleteStep(id: string) {
    await fetch("/api/products/cost-steps", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  // 制作費の固定工程（口金/貼り/縫製/その他）の単価をupsert。0/空なら削除。
  async function setProductionStep(stepName: string, value: number | null) {
    if (!product) return;
    const existing = product.costSteps.find(
      (s) => (s.category || "制作費") === "制作費" && s.step === stepName
    );
    if (value == null || value === 0) {
      if (existing) await deleteStep(existing.id);
      return;
    }
    if (existing) {
      await updateStep(existing.id, { unitCost: value });
    } else {
      await fetch("/api/products/cost-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, category: "制作費", step: stepName, unitCost: value, quantity: 1 }),
      });
      load();
    }
  }

  async function addMaterial(group: "生地費" | "資材費" | "梱包資材費") {
    const meta = {
      "生地費": { name: "新生地", category: "表地", unitType: "meter" },
      "資材費": { name: "新資材", category: "その他", unitType: "piece" },
      "梱包資材費": { name: "新梱包資材", category: "梱包資材", unitType: "piece" },
    }[group];
    await fetch("/api/products/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        name: meta.name,
        category: meta.category,
        unitPrice: 0,
        unitType: meta.unitType,
        yieldCount: 1,
      }),
    });
    load();
  }

  async function addMaterialsFromMaster(
    picks: { master: MasterMaterial; params: { yieldCount?: number; usedMeters?: number; usageCount?: number } }[]
  ) {
    // 複数選択をまとめて追加（順次POST）
    for (const { master, params } of picks) {
      await fetch("/api/products/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          materialId: master.id,
          ...params,
        }),
      });
    }
    setPickerCategory(null);
    load();
  }

  async function updateMaterial(id: string, data: Partial<Material>) {
    await fetch("/api/products/materials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    load();
  }

  async function deleteMaterial(id: string) {
    await fetch("/api/products/materials", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  // 大分類ごとに分類
  function isFabric(m: Material) {
    return m.topCategory === "生地費" || m.category === "fabric" || m.category === "生地" || m.category === "表地" || m.category === "裏地" || m.category === "芯材";
  }
  function isPackaging(m: Material) {
    return m.topCategory === "梱包資材費" || m.category === "梱包資材";
  }
  const fabricMaterials = product.materials.filter(isFabric);
  const packagingMaterials = product.materials.filter(isPackaging);
  const otherMaterials = product.materials.filter((m) => !isFabric(m) && !isPackaging(m));

  // 工程をカテゴリで分ける
  const productionSteps = product.costSteps.filter((s) => (s.category || "制作費") === "制作費");
  const cuttingSteps = product.costSteps.filter((s) => s.category === "裁断費");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/products" className="text-gray-500 hover:text-gray-700">← 商品マスタ</Link>
      </div>

      {/* 基本情報 */}
      <Card className="bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <p className="font-mono text-xs text-gray-500">{product.code}</p>
            <CardTitle className="text-xl">{product.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              {product.series && (
                <Badge className={getSeriesColor(product.series)}>{getSeriesLabel(product.series)}</Badge>
              )}
              {product.size && <span className="text-xs text-gray-500">{product.size}</span>}
              {!product.active && <Badge variant="outline">取扱終了</Badge>}
            </div>
          </div>
          {!editBasic && (
            <Button variant="outline" size="sm" onClick={() => setEditBasic(true)}>
              <Pencil className="size-4 mr-1" /> 基本情報を編集
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editBasic ? (
            <BasicEditForm product={product} onSave={saveBasic} onCancel={() => setEditBasic(false)} />
          ) : (
            <div className="space-y-4">
              {/* リード文・説明文・タグ（テキスト中心） */}
              {product.leadText && (
                <p className="text-base font-medium text-gray-800 leading-relaxed">{product.leadText}</p>
              )}
              {product.description && (
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{product.description}</p>
              )}
              {product.tags && (
                <div className="flex flex-wrap gap-1.5">
                  {product.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                    <span key={t} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">#{t}</span>
                  ))}
                </div>
              )}
              {!product.leadText && !product.description && !product.tags && (
                <p className="text-sm text-gray-400">「基本情報を編集」からリード文・説明文・タグを登録できます</p>
              )}

              {/* 数値スペック（下部に小さく） */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t text-sm">
                <div>
                  <p className="text-[11px] text-gray-400">参考価格（上代）</p>
                  <p className="font-medium">{product.retailPrice ? `${product.retailPrice.toLocaleString()}円` : "-"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400">在庫</p>
                  <p className="font-medium">{product.inventory?.stock ?? 0}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400">重さ</p>
                  <p className="font-medium">{product.weightG ? `${product.weightG.toLocaleString()}g` : "-"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400">生地 使用M</p>
                  <p className="font-medium">{product.usedMeters ? `${product.usedMeters}m` : "-"}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 原価計算サマリー */}
      <Card className="bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">原価サマリー（1個あたり）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="border-l-4 border-l-slate-500 pl-3 bg-slate-50/40 rounded-r p-2">
              <p className="text-xs text-gray-500">販管費</p>
              <p className="font-bold">{breakdown.laborCost.toLocaleString()}円</p>
              <p className="text-[10px] text-gray-400">営業{breakdown.salesCost}+出荷{breakdown.outboundCost}+管理{breakdown.mgmtCost}</p>
            </div>
            {isPurchase ? (
              <div className="border-l-4 border-l-emerald-500 pl-3 bg-emerald-50/40 rounded-r p-2 col-span-2 md:col-span-2">
                <p className="text-xs text-gray-500">仕入原価</p>
                <p className="font-bold">{Math.round(breakdown.purchaseCost).toLocaleString()}円</p>
              </div>
            ) : (
              <>
                <div className="border-l-4 border-l-rose-500 pl-3 bg-rose-50/40 rounded-r p-2">
                  <p className="text-xs text-gray-500">梱包資材費</p>
                  <p className="font-bold">{Math.round(breakdown.packagingMaterialCost).toLocaleString()}円</p>
                </div>
                <div className="border-l-4 border-l-blue-500 pl-3 bg-blue-50/40 rounded-r p-2">
                  <p className="text-xs text-gray-500">制作費</p>
                  <p className="font-bold">{breakdown.productionCost.toLocaleString()}円</p>
                </div>
                <div className="border-l-4 border-l-purple-500 pl-3 bg-purple-50/40 rounded-r p-2">
                  <p className="text-xs text-gray-500">生地費</p>
                  <p className="font-bold">{Math.round(breakdown.fabricCost).toLocaleString()}円</p>
                </div>
                <div className="border-l-4 border-l-amber-500 pl-3 bg-amber-50/40 rounded-r p-2">
                  <p className="text-xs text-gray-500">資材費</p>
                  <p className="font-bold">{Math.round(breakdown.materialCost).toLocaleString()}円</p>
                </div>
                <div className="border-l-4 border-l-teal-500 pl-3 bg-teal-50/40 rounded-r p-2">
                  <p className="text-xs text-gray-500">裁断費</p>
                  <p className="font-bold">{breakdown.cuttingCost.toLocaleString()}円</p>
                </div>
              </>
            )}
            <div className="border-l-4 border-l-red-500 pl-3 col-span-2 md:col-span-3 bg-red-50/30 rounded-r p-2">
              <p className="text-xs text-gray-500">合計原価</p>
              <p className="font-bold text-2xl">{Math.round(breakdown.total).toLocaleString()}円</p>
            </div>
          </div>

          {sellPrice > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t">
              <div>
                <p className="text-xs text-gray-500">卸単価</p>
                <p className="font-bold">{sellPrice.toLocaleString()}円</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">粗利</p>
                <p className={`font-bold ${profit > 0 ? "text-green-600" : "text-red-600"}`}>
                  {Math.round(profit).toLocaleString()}円
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">粗利率</p>
                <p className={`font-bold ${rate > 0 ? "text-green-600" : "text-red-600"}`}>
                  {rate.toFixed(1)}%
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 仕入単価（仕入品のみ） */}
      {isPurchase && (
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">仕入単価</CardTitle>
          </CardHeader>
          <CardContent>
            <PurchaseCostEditor purchaseCost={product.purchaseCost} onSave={saveBasic} />
            <p className="text-xs text-gray-400 mt-2">
              ※ 仕入品の1個あたりの仕入原価。原価 = 仕入単価 ＋ 販管費 で計算されます。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 販管費（営業費・出荷費・管理費） */}
      <Card className="bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">販管費（営業費・出荷費・管理費）</CardTitle>
        </CardHeader>
        <CardContent>
          <SgaEditor
            salesCost={product.salesCost}
            outboundCost={product.outboundCost}
            mgmtCost={product.mgmtCost}
            onSave={saveBasic}
          />
        </CardContent>
      </Card>

      {/* 上代と卸価格マトリクス */}
      <Card className="bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">上代・卸価格</CardTitle>
        </CardHeader>
        <CardContent>
          {/* 計算フロー図 */}
          <div className="mb-4 p-3 bg-blue-50/50 rounded border border-blue-100 text-xs text-gray-600">
            <p className="font-medium text-gray-700 mb-1">📐 計算の流れ</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono bg-white px-2 py-0.5 rounded border">
                原価 {Math.round(cost).toLocaleString()}円
              </span>
              <span>÷</span>
              <span className="font-mono bg-white px-2 py-0.5 rounded border">
                原価率 {(costRatio * 100).toFixed(0)}%
              </span>
              <span>=</span>
              <span className="font-mono bg-white px-2 py-0.5 rounded border">
                上代の目安 {suggestedRetail.toLocaleString()}円
              </span>
              <span className="text-gray-400">→ 実上代</span>
              <span className="font-mono bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                {retail.toLocaleString()}円
              </span>
              <span>×</span>
              <span className="font-mono bg-white px-2 py-0.5 rounded border">
                顧客掛率
              </span>
              <span>=</span>
              <span className="font-mono bg-green-100 px-2 py-0.5 rounded border border-green-200">
                販売価格
              </span>
            </div>
          </div>

          <PriceSettings
            cost={cost}
            retail={retail}
            costRatio={costRatio}
            actualCostRatio={actualCostRatio}
            suggestedRetail={suggestedRetail}
            onSaveRetail={(v) => saveBasic({ retailPrice: v })}
            onSaveCostRatio={(v) => saveBasic({ costRatio: v })}
          />

          {matrixRows.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2">取引タイプ別の販売価格と粗利</p>
              <table className="w-full text-sm border">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-500 border-r min-w-[140px]">取引タイプ</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-500 border-r w-20">掛率</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">計算式</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">販売価格</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">粗利</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">粗利率</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {matrixRows.map((row, idx) => (
                    <tr key={`${row.typeId}-${row.ratePct}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border-r">
                        <Badge className={`text-xs ${row.color}`}>{row.typeLabel}</Badge>
                        {row.kind === "markup" && (
                          <span className="ml-1 text-[10px] text-orange-600">↑</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-medium border-r">{row.ratePct}%</td>
                      <td className="px-3 py-2 text-right text-[11px] font-mono text-gray-500 border-r">
                        {retail.toLocaleString()} × {row.ratePct}%
                      </td>
                      <td className="px-3 py-2 text-right font-bold border-r">{row.price.toLocaleString()}円</td>
                      <td className={`px-3 py-2 text-right font-medium border-r ${row.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {row.profit.toLocaleString()}円
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${row.profitRate >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {row.profitRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2">
                ※ 販売価格 = 上代 × 掛率 / 粗利 = 販売価格 − 原価 / ↑ = 上代より高い価格設定（マークアップ）
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4 mt-2">上代を設定すると取引タイプ別の販売価格が表示されます</p>
          )}
        </CardContent>
      </Card>

      {/* 自社製造の原価内訳（仕入品では非表示） */}
      {!isPurchase && (<>
      {/* 制作費（固定4工程） */}
      <Card className="bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">制作費（口金・貼り・縫製・その他）</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">工程</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 w-40">単価（円/個）</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {PRODUCTION_STEPS.map((name) => {
                const step = productionSteps.find((s) => s.step === name);
                return (
                  <ProductionStepRow
                    key={name}
                    name={name}
                    value={step?.unitCost ?? null}
                    onSave={(v) => setProductionStep(name, v)}
                  />
                );
              })}
              <tr className="bg-blue-50/30 font-bold">
                <td className="px-3 py-2">制作費合計</td>
                <td className="px-3 py-2 text-right">{breakdown.productionCost.toLocaleString()}円</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2">
            ※ 工程は固定です。使わない工程は空欄のままでOK。
          </p>
        </CardContent>
      </Card>

      {/* 裁断費 */}
      <Card className="bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">裁断費（内製・外注）</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => addStep("裁断費", "内製")}>
              <Plus className="size-4 mr-1" /> 内製を追加
            </Button>
            <Button variant="outline" size="sm" onClick={() => addStep("裁断費", "外注")}>
              <Plus className="size-4 mr-1" /> 外注を追加
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {cuttingSteps.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">裁断作業未登録</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 w-16">区分</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">作業内容</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-20">ショット</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">単価/金額</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">小計</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">備考</th>
                  <th className="px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cuttingSteps.map((s) => (
                  <CuttingStepRow key={s.id} step={s} onUpdate={updateStep} onDelete={deleteStep} />
                ))}
                <tr className="bg-teal-50/30 font-bold">
                  <td className="px-3 py-2" colSpan={4}>裁断費合計</td>
                  <td className="px-3 py-2 text-right">{breakdown.cuttingCost.toLocaleString()}円</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* 生地費 */}
      <Card className="bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">生地費（表地・裏地・芯材）</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPickerCategory("生地費")}>
              <BookOpen className="size-4 mr-1" /> マスタから
            </Button>
            <Button variant="outline" size="sm" onClick={() => addMaterial("生地費")}>
              <Plus className="size-4 mr-1" /> 手入力
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <MaterialTable
            materials={fabricMaterials}
            onUpdate={updateMaterial}
            onDelete={deleteMaterial}
            totalLabel="生地費合計"
            totalValue={breakdown.fabricCost}
            variant="fabric"
            cutCtx={{ cutHeight: product.cutHeight, cutWidth: product.cutWidth, usedMeters: product.usedMeters }}
          />
        </CardContent>
      </Card>

      {/* 資材費 */}
      <Card className="bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">資材費（留め具・箱・鏡・その他）</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPickerCategory("資材費")}>
              <BookOpen className="size-4 mr-1" /> マスタから
            </Button>
            <Button variant="outline" size="sm" onClick={() => addMaterial("資材費")}>
              <Plus className="size-4 mr-1" /> 手入力
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <MaterialTable
            materials={otherMaterials}
            onUpdate={updateMaterial}
            onDelete={deleteMaterial}
            totalLabel="資材費合計"
            totalValue={breakdown.materialCost}
          />
        </CardContent>
      </Card>

      {/* 梱包資材費 */}
      <Card className="bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">梱包資材費</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPickerCategory("梱包資材費")}>
              <BookOpen className="size-4 mr-1" /> マスタから
            </Button>
            <Button variant="outline" size="sm" onClick={() => addMaterial("梱包資材費")}>
              <Plus className="size-4 mr-1" /> 手入力
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <MaterialTable
            materials={packagingMaterials}
            onUpdate={updateMaterial}
            onDelete={deleteMaterial}
            totalLabel="梱包資材費合計"
            totalValue={breakdown.packagingMaterialCost}
          />
        </CardContent>
      </Card>
      </>)}

      <MaterialPickerDialog
        category={pickerCategory}
        onClose={() => setPickerCategory(null)}
        onPickMany={addMaterialsFromMaster}
        existingMaterialIds={product.materials.map((m) => m.materialId).filter((x): x is string => !!x)}
        productCut={{ cutHeight: product.cutHeight, cutWidth: product.cutWidth, usedMeters: product.usedMeters }}
      />
    </div>
  );
}

// ─── 資材マスタピッカー ───
function MaterialPickerDialog({
  category,
  onClose,
  onPickMany,
  existingMaterialIds,
  productCut,
}: {
  category: "生地費" | "資材費" | "梱包資材費" | null;
  onClose: () => void;
  onPickMany: (picks: { master: MasterMaterial; params: { yieldCount?: number; usedMeters?: number; usageCount?: number } }[]) => void | Promise<void>;
  existingMaterialIds: string[];
  productCut: { cutHeight: number | null; cutWidth: number | null; usedMeters: number | null };
}) {
  const [items, setItems] = useState<MasterMaterial[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [usages, setUsages] = useState<Record<string, string>>({});
  // 複数選択：チェックした資材/生地のID
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!category) return;
    setLoading(true);
    // カテゴリマスタの階層(大分類→leaf)から対象カテゴリを解決する。
    // 大分類が未設定(parentId 無し)の環境向けに、固定マップをフォールバックとして残す。
    const FALLBACK_LEAF_MAP: Record<string, string[]> = {
      "生地費": ["表地", "裏地", "芯材"],
      "資材費": ["口金", "ファスナー", "ボタン", "箱", "鏡", "資材", "その他"],
      "梱包資材費": ["梱包資材"],
    };

    fetch(`/api/material-categories`)
      .then((r) => r.json())
      .then((cats: { id: string; name: string; parentId?: string | null; kind?: string }[]) => {
        const list = Array.isArray(cats) ? cats : [];
        const top = list.find((c) => c.name === category && c.kind === "top");
        const derived = top
          ? list.filter((c) => c.parentId === top.id).map((c) => c.name)
          : [];
        // マスタで割り当て済みならそれを使い、未設定なら固定マップにフォールバック
        return derived.length > 0 ? derived : (FALLBACK_LEAF_MAP[category] ?? []);
      })
      .catch(() => FALLBACK_LEAF_MAP[category] ?? [])
      .then((leaves) =>
        // 該当 leaf カテゴリ全部を fetch して結合
        Promise.all(leaves.map((leaf) => {
          const p = new URLSearchParams();
          p.set("category", leaf);
          if (search) p.set("search", search);
          return fetch(`/api/materials?${p}`).then((r) => r.json()).catch(() => []);
        }))
      )
      .then((results) => {
        const merged = results.flatMap((r) => Array.isArray(r) ? r : []);
        setItems(merged);
      })
      .finally(() => setLoading(false));
  }, [category, search, productCut]);

  // ダイアログを閉じたら入力値・選択・追加中フラグをクリア。
  // （このコンポーネントは常時マウントされ閉じても state が残るため、
  //   adding をリセットしないと2回目以降「追加中...」で固まる）
  useEffect(() => {
    if (!category) {
      setUsages({});
      setSelected({});
      setAdding(false);
    }
  }, [category]);

  const open = !!category;
  const isFabricPicker = category === "生地費";

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const selectedCount = selectedIds.length;

  function toggle(id: string) {
    setSelected((p) => ({ ...p, [id]: !p[id] }));
  }

  async function addSelected() {
    if (selectedCount === 0 || adding) return;
    setAdding(true);
    const picks = selectedIds
      .map((id) => items.find((it) => it.id === id))
      .filter((m): m is MasterMaterial => !!m)
      .map((m) => {
        if (isFabricPicker) return { master: m, params: {} };
        const usageNum = Number(usages[m.id] ?? "1");
        return { master: m, params: { usageCount: usageNum > 0 ? usageNum : 1 } };
      });
    try {
      await onPickMany(picks);
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {category}を選択
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="名前・コードで検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            {isFabricPicker
              ? "※ チェックで複数選択できます。追加後、原価画面の生地行で 使用M・取れ数・裁断サイズを商品ごとに設定します"
              : "※ チェックで複数選択できます。資材は1個あたりの使用数を入力（例: ボタン2個使い → 2）"}
          </p>
          <div className="max-h-96 overflow-y-auto border rounded-md">
            {loading ? (
              <p className="text-center py-4 text-gray-400 text-sm">読み込み中...</p>
            ) : items.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400">
                <p>登録された{category}がありません</p>
                <Link href="/materials" className="text-blue-600 hover:underline text-xs mt-1 inline-block">
                  資材マスタで登録 →
                </Link>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 w-8"></th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">名前</th>
                    <th className="text-right px-2 py-1.5 font-medium text-gray-500 w-24">単価</th>
                    {isFabricPicker ? (
                      <th className="text-center px-2 py-1.5 font-medium text-gray-500 w-32">巾 / 尺</th>
                    ) : (
                      <>
                        <th className="text-center px-2 py-1.5 font-medium text-gray-500 w-20">使用数 *</th>
                        <th className="text-right px-2 py-1.5 font-medium text-gray-500 w-24">1個あたり</th>
                      </>
                    )}
                    <th className="px-2 py-1.5 w-16 text-right font-medium text-gray-500 text-xs">状態</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((m) => {
                    const used = existingMaterialIds.includes(m.id);
                    const unitLabel = m.unitType === "meter" ? "m" : m.unitType === "set" ? "セット" : "個";

                    if (isFabricPicker) {
                      // 取れ数・使用M・裁断サイズは商品ごとに異なるため、追加後に原価画面の行で設定する
                      const checked = !!selected[m.id];
                      return (
                        <tr
                          key={m.id}
                          className={`hover:bg-gray-50 cursor-pointer ${checked ? "bg-blue-50" : ""} ${used ? "opacity-50" : ""}`}
                          onClick={() => !used && toggle(m.id)}
                        >
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={used}
                              onChange={() => toggle(m.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="size-4 align-middle"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="font-medium">{m.name}</div>
                            {m.code && <div className="font-mono text-[10px] text-gray-400">{m.code}</div>}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {m.unitPrice.toLocaleString()}円/{unitLabel}
                          </td>
                          <td className="px-2 py-1.5 text-center text-gray-600 text-xs">
                            {m.fabricWidth ? `巾${m.fabricWidth}cm` : <span className="text-gray-300">巾未設定</span>}
                            {m.fabricLength ? ` × ${m.fabricLength}尺` : ""}
                          </td>
                          <td className="px-2 py-1.5 text-right text-[10px] text-gray-400">
                            {used ? "登録済" : ""}
                          </td>
                        </tr>
                      );
                    }

                    // 資材・梱包資材: 使用数
                    const usageStr = usages[m.id] ?? "1";
                    const usageNum = Number(usageStr);
                    const perPiece = usageNum > 0 ? m.unitPrice * usageNum : 0;
                    const checked = !!selected[m.id];
                    return (
                      <tr key={m.id} className={`hover:bg-gray-50 ${checked ? "bg-blue-50" : ""} ${used ? "opacity-50" : ""}`}>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={used}
                            onChange={() => toggle(m.id)}
                            className="size-4 align-middle"
                          />
                        </td>
                        <td className="px-2 py-1.5 cursor-pointer" onClick={() => !used && toggle(m.id)}>
                          <div className="font-medium">{m.name}</div>
                          {m.code && <div className="font-mono text-[10px] text-gray-400">{m.code}</div>}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {m.unitPrice.toLocaleString()}円/{unitLabel}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={usageStr}
                            onChange={(e) => setUsages((p) => ({ ...p, [m.id]: e.target.value }))}
                            disabled={used}
                            placeholder="1"
                            className="w-full px-2 py-1 text-sm border rounded text-right disabled:bg-gray-100"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-600">
                          {usageNum > 0 ? `${perPiece.toFixed(1)}円` : "-"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[10px] text-gray-400">
                          {used ? "登録済" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs text-gray-400">
              <Link href="/materials" className="text-blue-600 hover:underline">資材マスタ</Link>
              で新規登録・編集できます
            </p>
            <Button
              onClick={addSelected}
              disabled={selectedCount === 0 || adding}
              className={selectedCount > 0 ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              {adding ? "追加中..." : selectedCount > 0 ? `選択した${selectedCount}件を追加` : "追加する項目を選択"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 販管費エディタ（営業費・出荷費・管理費） ───
function PurchaseCostEditor({
  purchaseCost,
  onSave,
}: {
  purchaseCost: number | null;
  onSave: (d: Partial<Product>) => void;
}) {
  const [val, setVal] = useState(purchaseCost?.toString() || "");
  useEffect(() => setVal(purchaseCost?.toString() || ""), [purchaseCost]);
  const dirty = Number(val || 0) !== (purchaseCost ?? 0);
  function commit() {
    if (!dirty) return;
    onSave({ purchaseCost: val ? Number(val) : null });
  }
  return (
    <div className="flex items-end gap-2">
      <div>
        <label className="text-xs text-gray-500">仕入単価（円/個）</label>
        <Input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          className="w-40"
          placeholder="例: 500"
        />
      </div>
      <Button
        size="sm"
        onClick={commit}
        disabled={!dirty}
        className={dirty ? "bg-amber-500 hover:bg-amber-600" : ""}
      >
        <Save className="size-4 mr-1" /> {dirty ? "確定" : "変更なし"}
      </Button>
    </div>
  );
}

function SgaEditor({
  salesCost,
  outboundCost,
  mgmtCost,
  onSave,
}: {
  salesCost: number | null;
  outboundCost: number | null;
  mgmtCost: number | null;
  onSave: (d: Partial<Product>) => void;
}) {
  const [sales, setSales] = useState(salesCost?.toString() || "");
  const [outbound, setOutbound] = useState(outboundCost?.toString() || "");
  const [mgmt, setMgmt] = useState(mgmtCost?.toString() || "");

  useEffect(() => setSales(salesCost?.toString() || ""), [salesCost]);
  useEffect(() => setOutbound(outboundCost?.toString() || ""), [outboundCost]);
  useEffect(() => setMgmt(mgmtCost?.toString() || ""), [mgmtCost]);

  const dirty =
    Number(sales || 0) !== (salesCost ?? 0) ||
    Number(outbound || 0) !== (outboundCost ?? 0) ||
    Number(mgmt || 0) !== (mgmtCost ?? 0);

  const total = (Number(sales) || 0) + (Number(outbound) || 0) + (Number(mgmt) || 0);

  function commit() {
    if (!dirty) return;
    onSave({
      salesCost: sales ? Number(sales) : null,
      outboundCost: outbound ? Number(outbound) : null,
      mgmtCost: mgmt ? Number(mgmt) : null,
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        ※ 販売費及び一般管理費。原価に含めて計算します（運賃は営業費に、梱包費は出荷費に統合済み）
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500">営業費（円/個、運賃込）</label>
          <Input type="number" value={sales} onChange={(e) => setSales(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="text-xs text-gray-500">出荷費（円/個、梱包込）</label>
          <Input type="number" value={outbound} onChange={(e) => setOutbound(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="text-xs text-gray-500">管理費（円/個）</label>
          <Input type="number" value={mgmt} onChange={(e) => setMgmt(e.target.value)} placeholder="0" />
        </div>
        <div>
          <p className="text-xs text-gray-500">販管費合計</p>
          <p className="font-bold text-lg">{total.toLocaleString()}<span className="text-sm font-normal text-gray-500"> 円</span></p>
        </div>
      </div>
      <Button onClick={commit} disabled={!dirty} size="sm">
        <Save className="size-4 mr-1" /> {dirty ? "確定して保存" : "変更なし"}
      </Button>
    </div>
  );
}

// ─── 上代・原価率の設定 ───
function PriceSettings({
  cost,
  retail,
  costRatio,
  actualCostRatio,
  suggestedRetail,
  onSaveRetail,
  onSaveCostRatio,
}: {
  cost: number;
  retail: number;
  costRatio: number;
  actualCostRatio: number;
  suggestedRetail: number;
  onSaveRetail: (v: number) => void;
  onSaveCostRatio: (v: number) => void;
}) {
  const [retailDraft, setRetailDraft] = useState(String(retail));
  const [ratioDraft, setRatioDraft] = useState(String(Math.round(costRatio * 100)));

  // 同期
  useEffect(() => setRetailDraft(String(retail)), [retail]);
  useEffect(() => setRatioDraft(String(Math.round(costRatio * 100))), [costRatio]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label className="text-xs text-gray-500">原価（自動計算）</label>
        <p className="font-bold text-2xl">{Math.round(cost).toLocaleString()}<span className="text-sm font-normal text-gray-500"> 円</span></p>
      </div>
      <div>
        <label className="text-xs text-gray-500">上代（小売価格）</label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={retailDraft}
            onChange={(e) => setRetailDraft(e.target.value)}
            onBlur={() => {
              const n = Number(retailDraft);
              if (!isNaN(n) && n !== retail) onSaveRetail(n);
            }}
            placeholder="未設定"
            className="text-lg font-bold"
          />
        </div>
        {cost > 0 && retail > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            実原価率: {(actualCostRatio * 100).toFixed(1)}%
          </p>
        )}
      </div>
      <div>
        <label className="text-xs text-gray-500">原価率（逆算用）</label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.1"
            value={ratioDraft}
            onChange={(e) => setRatioDraft(e.target.value)}
            onBlur={() => {
              const pct = Number(ratioDraft);
              if (!isNaN(pct)) {
                const ratio = pct / 100;
                if (Math.abs(ratio - costRatio) > 0.0001) onSaveCostRatio(ratio);
              }
            }}
            className="w-20"
          />
          <span className="text-sm text-gray-500">%</span>
        </div>
        {cost > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSaveRetail(suggestedRetail)}
            className="mt-1 text-xs"
          >
            原価÷{(costRatio * 100).toFixed(0)}%で逆算 → {suggestedRetail.toLocaleString()}円
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── 基本情報編集フォーム ───
function BasicEditForm({
  product,
  onSave,
  onCancel,
}: {
  product: Product;
  onSave: (d: Partial<Product>) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(product.code);
  const [name, setName] = useState(product.name);
  const [series, setSeries] = useState(product.series || "");
  const [size, setSize] = useState(product.size || "");
  const [wholesalePrice, setWholesalePrice] = useState(product.wholesalePrice?.toString() || "");
  const [cutHeight, setCutHeight] = useState(product.cutHeight?.toString() || "");
  const [cutWidth, setCutWidth] = useState(product.cutWidth?.toString() || "");
  const [usedMeters, setUsedMeters] = useState(product.usedMeters?.toString() || "");
  const [sizeW, setSizeW] = useState(product.sizeW?.toString() || "");
  const [sizeH, setSizeH] = useState(product.sizeH?.toString() || "");
  const [sizeD, setSizeD] = useState(product.sizeD?.toString() || "");
  const [weightG, setWeightG] = useState(product.weightG?.toString() || "");
  const [leadText, setLeadText] = useState(product.leadText || "");
  const [tags, setTags] = useState(product.tags || "");
  const [description, setDescription] = useState(product.description || "");
  const [shortName, setShortName] = useState(product.shortName || "");
  const [fnsku, setFnsku] = useState(product.fnsku || "");
  const [hasNonwoven, setHasNonwoven] = useState(product.hasNonwoven);
  const [active, setActive] = useState(product.active);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          code,
          name,
          series: series || null,
          size: size || null,
          wholesalePrice: wholesalePrice ? Number(wholesalePrice) : null,
          cutHeight: cutHeight ? Number(cutHeight) : null,
          cutWidth: cutWidth ? Number(cutWidth) : null,
          usedMeters: usedMeters ? Number(usedMeters) : null,
          sizeW: sizeW ? Number(sizeW) : null,
          sizeH: sizeH ? Number(sizeH) : null,
          sizeD: sizeD ? Number(sizeD) : null,
          weightG: weightG ? Number(weightG) : null,
          leadText: leadText || null,
          tags: tags || null,
          description: description || null,
          shortName: shortName || null,
          fnsku: fnsku || null,
          hasNonwoven,
          active,
        });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">商品コード</label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div>
          <label className="text-xs text-gray-500">商品名</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="text-xs text-gray-500">シリーズ</label>
          <select value={series} onChange={(e) => setSeries(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">未設定</option>
            {PRODUCT_SERIES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">サイズ</label>
          <Input value={size} onChange={(e) => setSize(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500">卸単価（円）</label>
          <Input type="number" value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500">裁断 縦（cm）</label>
          <Input type="number" value={cutHeight} onChange={(e) => setCutHeight(e.target.value)} placeholder="例: 15" />
        </div>
        <div>
          <label className="text-xs text-gray-500">裁断 横（cm）</label>
          <Input type="number" value={cutWidth} onChange={(e) => setCutWidth(e.target.value)} placeholder="例: 10" />
        </div>
        <div>
          <label className="text-xs text-gray-500">生地 使用M（m/個）</label>
          <Input type="number" step="0.01" value={usedMeters} onChange={(e) => setUsedMeters(e.target.value)} placeholder="例: 0.9" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-gray-500">サイズ W（cm）</label>
          <Input type="number" step="0.1" value={sizeW} onChange={(e) => setSizeW(e.target.value)} placeholder="幅" />
        </div>
        <div>
          <label className="text-xs text-gray-500">サイズ H（cm）</label>
          <Input type="number" step="0.1" value={sizeH} onChange={(e) => setSizeH(e.target.value)} placeholder="高さ" />
        </div>
        <div>
          <label className="text-xs text-gray-500">サイズ D（cm）</label>
          <Input type="number" step="0.1" value={sizeD} onChange={(e) => setSizeD(e.target.value)} placeholder="奥行" />
        </div>
        <div>
          <label className="text-xs text-gray-500">重さ（g）</label>
          <Input type="number" step="0.1" value={weightG} onChange={(e) => setWeightG(e.target.value)} placeholder="例: 45" />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">リード文（短いキャッチコピー）</label>
        <Input value={leadText} onChange={(e) => setLeadText(e.target.value)} placeholder="例: 手のひらサイズの西陣織がま口財布" />
      </div>
      <div>
        <label className="text-xs text-gray-500">説明文</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full border rounded-md px-3 py-2 text-sm resize-y"
          placeholder="商品の詳細な説明。改行も使えます。"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">タグ（カンマ区切り）</label>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="例: がま口,西陣,財布,金襴" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">略称（ラベル/カード用）</label>
          <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="例: 西2.6" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Amazon FNSKU（バーコード用）</label>
          <Input value={fnsku} onChange={(e) => setFnsku(e.target.value)} placeholder="例: X00ABC1234" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hasNonwoven} onChange={(e) => setHasNonwoven(e.target.checked)} />
        不織あり（西陣織＋不織布の2層）
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        有効（取扱中）
      </label>
      <div className="flex gap-2">
        <Button type="submit"><Save className="size-4 mr-1" /> 保存</Button>
        <Button type="button" variant="outline" onClick={onCancel}><X className="size-4 mr-1" /> キャンセル</Button>
      </div>
    </form>
  );
}

// ─── 制作費の固定工程行（単価だけ入力） ───
function ProductionStepRow({
  name,
  value,
  onSave,
}: {
  name: string;
  value: number | null;
  onSave: (v: number | null) => void;
}) {
  const [val, setVal] = useState(value != null ? String(value) : "");
  useEffect(() => setVal(value != null ? String(value) : ""), [value]);
  const dirty = (val === "" ? null : Number(val)) !== value;
  function commit() {
    if (!dirty) return;
    onSave(val === "" ? null : Number(val) || 0);
  }
  return (
    <tr className={dirty ? "bg-amber-50/40" : ""}>
      <td className="px-3 py-1.5 font-medium">{name}</td>
      <td className="px-3 py-1.5">
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="0"
            className="w-24 px-2 py-1 text-sm border rounded text-right"
          />
          <span className="text-xs text-gray-400">円</span>
          <button
            onClick={commit}
            disabled={!dirty}
            className={`p-1 rounded ${dirty ? "text-white bg-amber-500 hover:bg-amber-600" : "text-gray-300 cursor-not-allowed"}`}
            title="確定"
          >
            <Check className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── 工程行 ───
function CostStepRow({
  step,
  onUpdate,
  onDelete,
}: {
  step: CostStep;
  onUpdate: (id: string, d: Partial<CostStep>) => Promise<void> | void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(step.step);
  const [cost, setCost] = useState(String(step.unitCost));
  const [note, setNote] = useState(step.note || "");

  const dirty =
    name !== step.step ||
    Number(cost) !== step.unitCost ||
    note !== (step.note || "");

  async function commitAll() {
    if (!dirty) return;
    await onUpdate(step.id, {
      step: name,
      unitCost: Number(cost) || 0,
      note: note || null,
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitAll();
    }
  }

  return (
    <tr className={dirty ? "bg-amber-50/40" : ""}>
      <td className="px-3 py-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKey}
          className="w-full px-2 py-1 text-sm border rounded"
        />
      </td>
      <td className="px-3 py-1">
        <input
          type="number"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          onKeyDown={handleKey}
          className="w-full px-2 py-1 text-sm border rounded text-right"
        />
      </td>
      <td className="px-3 py-1">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={handleKey}
          className="w-full px-2 py-1 text-sm border rounded"
          placeholder="（任意）"
        />
      </td>
      <td className="px-3 py-1 text-right">
        <div className="flex gap-1 justify-end">
          <button
            onClick={commitAll}
            disabled={!dirty}
            className={`p-1 rounded ${dirty ? "text-white bg-amber-500 hover:bg-amber-600" : "text-gray-300 cursor-not-allowed"}`}
            title="確定"
          >
            <Check className="size-4" />
          </button>
          <button onClick={() => onDelete(step.id)} className="text-red-500 hover:bg-red-50 p-1 rounded" title="削除">
            <Trash2 className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── 裁断費の専用行（内製/外注） ───
function CuttingStepRow({
  step,
  onUpdate,
  onDelete,
}: {
  step: CostStep;
  onUpdate: (id: string, d: Partial<CostStep>) => Promise<void> | void;
  onDelete: (id: string) => void;
}) {
  const subType = (step.subType || "内製") as "内製" | "外注";
  const [name, setName] = useState(step.step);
  const [quantity, setQuantity] = useState(String(step.quantity ?? 1));
  const [unitCost, setUnitCost] = useState(String(step.unitCost));
  const [note, setNote] = useState(step.note || "");

  const isInternal = subType === "内製";
  const qNum = Number(quantity) || 0;
  const cNum = Number(unitCost) || 0;
  const subtotal = isInternal ? qNum * cNum : cNum;

  const dirty =
    name !== step.step ||
    (isInternal && qNum !== step.quantity) ||
    cNum !== step.unitCost ||
    note !== (step.note || "");

  async function commitAll() {
    if (!dirty) return;
    await onUpdate(step.id, {
      step: name,
      quantity: isInternal ? qNum : 1,
      unitCost: cNum,
      note: note || null,
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commitAll(); }
  }

  return (
    <tr className={dirty ? "bg-amber-50/40" : ""}>
      <td className="px-3 py-1">
        <Badge
          className={
            isInternal ? "bg-teal-100 text-teal-700" : "bg-orange-100 text-orange-700"
          }
        >
          {subType}
        </Badge>
      </td>
      <td className="px-3 py-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKey}
          className="w-full px-2 py-1 text-sm border rounded"
        />
      </td>
      <td className="px-3 py-1">
        {isInternal ? (
          <input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onKeyDown={handleKey}
            className="w-full px-2 py-1 text-sm border rounded text-right"
            placeholder="例: 4"
          />
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-1">
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            onKeyDown={handleKey}
            className="w-full px-2 py-1 text-sm border rounded text-right"
          />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            {isInternal ? "円/shot" : "円"}
          </span>
        </div>
      </td>
      <td className="px-3 py-1 text-right font-medium">
        {subtotal.toLocaleString()}円
      </td>
      <td className="px-3 py-1">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={handleKey}
          className="w-full px-2 py-1 text-sm border rounded"
          placeholder="（任意）"
        />
      </td>
      <td className="px-3 py-1 text-right">
        <div className="flex gap-1 justify-end">
          <button
            onClick={commitAll}
            disabled={!dirty}
            className={`p-1 rounded ${dirty ? "text-white bg-amber-500 hover:bg-amber-600" : "text-gray-300 cursor-not-allowed"}`}
            title="確定"
          >
            <Check className="size-4" />
          </button>
          <button onClick={() => onDelete(step.id)} className="text-red-500 hover:bg-red-50 p-1 rounded" title="削除">
            <Trash2 className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── 材料テーブル ───
// variant="fabric": 単価 × 使用M ÷ 取れ数
// variant="usage":  単価 × 使用数
function MaterialTable({
  materials,
  onUpdate,
  onDelete,
  totalLabel,
  totalValue,
  variant = "usage",
  cutCtx,
}: {
  materials: Material[];
  onUpdate: (id: string, d: Partial<Material>) => void;
  onDelete: (id: string) => void;
  totalLabel: string;
  totalValue: number;
  variant?: "fabric" | "usage";
  cutCtx?: { cutHeight: number | null; cutWidth: number | null; usedMeters: number | null };
}) {
  if (materials.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">未登録</p>;
  }
  const isFabric = variant === "fabric";
  const colCount = isFabric ? 8 : 5;
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr>
          <th className="text-left px-3 py-2 font-medium text-gray-500">名称</th>
          <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">単価</th>
          {isFabric ? (
            <>
              <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">使用M<span className="text-[9px] text-gray-400 block">一度に使うm</span></th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">取れ数<span className="text-[9px] text-gray-400 block">使用Mから何枚</span></th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 w-20">使用数<span className="text-[9px] text-gray-400 block">枚数</span></th>
              <th className="text-center px-3 py-2 font-medium text-gray-500 w-40">裁断サイズ<span className="text-[9px] text-gray-400 block">縦×横cm / 方法</span></th>
            </>
          ) : (
            <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">使用数</th>
          )}
          <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">1個あたり</th>
          <th className="px-3 py-2 w-20"></th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {materials.map((m) => (
          <MaterialRow key={m.id} material={m} onUpdate={onUpdate} onDelete={onDelete} variant={variant} cutCtx={cutCtx} />
        ))}
        <tr className="bg-blue-50/30 font-bold">
          <td className="px-3 py-2" colSpan={colCount - 2}>{totalLabel}</td>
          <td className="px-3 py-2 text-right">{Math.round(totalValue).toLocaleString()}円</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  );
}

function MaterialRow({
  material,
  onUpdate,
  onDelete,
  variant,
  cutCtx,
}: {
  material: Material;
  onUpdate: (id: string, d: Partial<Material>) => Promise<void> | void;
  onDelete: (id: string) => void;
  variant: "fabric" | "usage";
  cutCtx?: { cutHeight: number | null; cutWidth: number | null; usedMeters: number | null };
}) {
  const isFabric = variant === "fabric";
  const [name, setName] = useState(material.name);
  const [unitPrice, setUnitPrice] = useState(String(material.unitPrice));
  const [usageCount, setUsageCount] = useState(String(material.usageCount ?? 1));
  // 取れ数・使用M とも商品×生地ごとの実測値（手入力）
  const [yieldCount, setYieldCount] = useState(String(material.yieldCount ?? 1));
  const [usedMeters, setUsedMeters] = useState(String(material.usedMeters ?? 1));
  // 裁断サイズ・方法（記録用）
  const [cutH, setCutH] = useState(material.cutH != null ? String(material.cutH) : "");
  const [cutW, setCutW] = useState(material.cutW != null ? String(material.cutW) : "");
  const [cutType, setCutType] = useState(material.cutType ?? "");

  const usedM = Number(usedMeters) || 0;
  // マスタ連動の行は単価をマスタ側で管理する（商品側では編集不可）
  const isMasterLinked = material.materialId != null;

  const dirty =
    name !== material.name ||
    (!isMasterLinked && Number(unitPrice) !== material.unitPrice) ||
    Number(usageCount) !== (material.usageCount ?? 1) ||
    (isFabric && (
      Number(yieldCount) !== (material.yieldCount ?? 1) ||
      Number(usedMeters) !== (material.usedMeters ?? 1) ||
      cutH !== (material.cutH != null ? String(material.cutH) : "") ||
      cutW !== (material.cutW != null ? String(material.cutW) : "") ||
      cutType !== (material.cutType ?? "")
    ));

  async function commitAll() {
    if (!dirty) return;
    await onUpdate(material.id, {
      name,
      ...(!isMasterLinked && { unitPrice: Number(unitPrice) || 0 }),
      usageCount: Number(usageCount) || 1,
      ...(isFabric && {
        yieldCount: Number(yieldCount) || 1,
        usedMeters: Number(usedMeters) || 1,
        cutH: cutH === "" ? null : Number(cutH),
        cutW: cutW === "" ? null : Number(cutW),
        cutType: cutType || null,
      }),
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitAll();
    }
  }

  // 1個あたり: 生地 = 単価 × 使用M ÷ 取れ数 × 使用数 / 資材 = 単価 × 使用数
  const yieldNum = Number(yieldCount) || 0;
  const perPiece = isFabric
    ? (yieldNum > 0 ? (Number(unitPrice) * usedM) / yieldNum * (Number(usageCount) || 1) : 0)
    : Number(unitPrice) * (Number(usageCount) || 1);

  return (
    <tr className={dirty ? "bg-amber-50/40" : ""}>
      <td className="px-3 py-1">
        <div className="flex items-center gap-1">
          {material.materialId && (
            <Link2 className="size-3 text-blue-500 shrink-0" aria-label="マスタ連動" />
          )}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKey}
            className="w-full px-2 py-1 text-sm border rounded"
          />
        </div>
      </td>
      <td className="px-3 py-1">
        <div className="flex items-center gap-1">
          {isMasterLinked ? (
            // マスタ連動の行は資材マスタの単価を表示（編集はマスタ側で行う）
            <span
              className="w-full px-2 py-1 text-sm text-right text-gray-700 bg-gray-50 border border-transparent rounded"
              title="資材マスタで設定された単価です。変更はマスタ側で行ってください"
            >
              {material.unitPrice.toLocaleString()}
            </span>
          ) : (
            <input
              type="number"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              onKeyDown={handleKey}
              className="w-full px-2 py-1 text-sm border rounded text-right"
            />
          )}
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            円{isFabric ? "/m" : ""}
          </span>
        </div>
      </td>
      {isFabric ? (
        <>
          <td className="px-3 py-1">
            <input
              type="number"
              step="0.1"
              min="0"
              value={usedMeters}
              onChange={(e) => setUsedMeters(e.target.value)}
              onKeyDown={handleKey}
              className="w-full px-2 py-1 text-sm border rounded text-right"
              placeholder="1"
            />
          </td>
          <td className="px-3 py-1">
            <input
              type="number"
              step="1"
              min="0"
              value={yieldCount}
              onChange={(e) => setYieldCount(e.target.value)}
              onKeyDown={handleKey}
              className="w-full px-2 py-1 text-sm border rounded text-right"
              placeholder="1"
            />
          </td>
          <td className="px-3 py-1">
            <input
              type="number"
              step="0.1"
              min="0"
              value={usageCount}
              onChange={(e) => setUsageCount(e.target.value)}
              onKeyDown={handleKey}
              className="w-full px-2 py-1 text-sm border rounded text-right"
              placeholder="1"
            />
          </td>
          <td className="px-3 py-1">
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.1"
                min="0"
                value={cutH}
                onChange={(e) => setCutH(e.target.value)}
                onKeyDown={handleKey}
                className="w-12 px-1 py-1 text-sm border rounded text-right"
                placeholder="縦"
                title="裁断 縦 cm"
              />
              <span className="text-gray-400 text-xs">×</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={cutW}
                onChange={(e) => setCutW(e.target.value)}
                onKeyDown={handleKey}
                className="w-12 px-1 py-1 text-sm border rounded text-right"
                placeholder="横"
                title="裁断 横 cm"
              />
              <select
                value={cutType}
                onChange={(e) => setCutType(e.target.value)}
                className="px-1 py-1 text-xs border rounded bg-white"
                title="裁断方法"
              >
                <option value="">方法</option>
                <option value="型抜">型抜</option>
                <option value="手裁断">手裁断</option>
              </select>
            </div>
          </td>
        </>
      ) : (
        <td className="px-3 py-1">
          <input
            type="number"
            step="0.1"
            min="0"
            value={usageCount}
            onChange={(e) => setUsageCount(e.target.value)}
            onKeyDown={handleKey}
            className="w-full px-2 py-1 text-sm border rounded text-right"
            placeholder="例: 2"
          />
        </td>
      )}
      <td className="px-3 py-1 text-right text-gray-700 font-medium">
        {perPiece.toFixed(1)}円
      </td>
      <td className="px-3 py-1 text-right">
        <div className="flex gap-1 justify-end">
          <button
            onClick={commitAll}
            disabled={!dirty}
            className={`p-1 rounded ${dirty ? "text-white bg-amber-500 hover:bg-amber-600" : "text-gray-300 cursor-not-allowed"}`}
            title="確定"
          >
            <Check className="size-4" />
          </button>
          <button onClick={() => onDelete(material.id)} className="text-red-500 hover:bg-red-50 p-1 rounded" title="削除">
            <Trash2 className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
