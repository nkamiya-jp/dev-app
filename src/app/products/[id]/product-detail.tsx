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
  calcFabricYield,
  DEFAULT_COST_RATIO,
} from "@/lib/product-cost";
import { getAllMatrixRows } from "@/lib/contact-meta";
import { calcYieldPerMeter, describeYield } from "@/lib/cutting-calc";

interface MasterMaterial {
  id: string;
  code: string | null;
  name: string;
  category: string;
  unitPrice: number;
  unitType: string;
  fabricWidth: number | null;
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
  fabricWidth?: number | null;  // 連動した資材マスタの巾（生地）
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
    cutHeight: product.cutHeight,
    cutWidth: product.cutWidth,
    usedMeters: product.usedMeters,
    costSteps: product.costSteps,
    materials: product.materials,
  });
  const sellPrice = product.wholesalePrice ?? 0;
  const { profit, rate } = calcGrossProfit(breakdown.total, sellPrice);

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

  async function addMaterialFromMaster(
    master: MasterMaterial,
    params: { yieldCount?: number; usedMeters?: number; usageCount?: number }
  ) {
    await fetch("/api/products/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        materialId: master.id,
        ...params,
      }),
    });
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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t text-sm">
                <div>
                  <p className="text-[11px] text-gray-400">卸単価</p>
                  <p className="font-medium">{product.wholesalePrice ? `${product.wholesalePrice.toLocaleString()}円` : "-"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400">在庫</p>
                  <p className="font-medium">{product.inventory?.stock ?? 0}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400">サイズ W×H×D</p>
                  <p className="font-medium">
                    {product.sizeW || product.sizeH || product.sizeD
                      ? `${product.sizeW ?? "-"}×${product.sizeH ?? "-"}×${product.sizeD ?? "-"}`
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400">重さ</p>
                  <p className="font-medium">{product.weightG ? `${product.weightG.toLocaleString()}g` : "-"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400">裁断 縦×横</p>
                  <p className="font-medium">
                    {product.cutHeight && product.cutWidth ? `${product.cutHeight}×${product.cutWidth}` : "-"}
                  </p>
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

      {/* 制作費 */}
      <Card className="bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">制作費</CardTitle>
          <Button variant="outline" size="sm" onClick={() => addStep("制作費")}>
            <Plus className="size-4 mr-1" /> 工程を追加
          </Button>
        </CardHeader>
        <CardContent>
          {productionSteps.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">工程未登録</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">工程</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-32">単価（円/個）</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">備考</th>
                  <th className="px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {productionSteps.map((s) => (
                  <CostStepRow key={s.id} step={s} onUpdate={updateStep} onDelete={deleteStep} />
                ))}
                <tr className="bg-blue-50/30 font-bold">
                  <td className="px-3 py-2">制作費合計</td>
                  <td className="px-3 py-2 text-right">{breakdown.productionCost.toLocaleString()}円</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          )}
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
          {(!product.cutHeight || !product.cutWidth || !product.usedMeters) && (
            <p className="text-xs text-amber-600 mt-2">
              ⚠ 取れ数・使用Mを自動計算するには、基本情報の編集で「裁断 縦×横」と「使用M」を設定してください
            </p>
          )}
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

      <MaterialPickerDialog
        category={pickerCategory}
        onClose={() => setPickerCategory(null)}
        onPick={addMaterialFromMaster}
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
  onPick,
  existingMaterialIds,
  productCut,
}: {
  category: "生地費" | "資材費" | "梱包資材費" | null;
  onClose: () => void;
  onPick: (m: MasterMaterial, params: { yieldCount?: number; usedMeters?: number; usageCount?: number }) => void;
  existingMaterialIds: string[];
  productCut: { cutHeight: number | null; cutWidth: number | null; usedMeters: number | null };
}) {
  const [items, setItems] = useState<MasterMaterial[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [yields, setYields] = useState<Record<string, string>>({});
  const [meters, setMeters] = useState<Record<string, string>>({});
  const [usages, setUsages] = useState<Record<string, string>>({});

  // 大分類 → そこに属する leaf カテゴリの一覧
  const LEAF_MAP: Record<string, string[]> = {
    "生地費": ["表地", "裏地", "芯材"],
    "資材費": ["口金", "ファスナー", "ボタン", "箱", "鏡", "その他"],
    "梱包資材費": ["梱包資材"],
  };

  useEffect(() => {
    if (!category) return;
    setLoading(true);
    const leaves = LEAF_MAP[category] ?? [];
    // 該当 leaf カテゴリ全部を fetch して結合
    Promise.all(leaves.map((leaf) => {
      const p = new URLSearchParams();
      p.set("category", leaf);
      if (search) p.set("search", search);
      return fetch(`/api/materials?${p}`).then((r) => r.json()).catch(() => []);
    }))
      .then((results) => {
        const merged = results.flatMap((r) => Array.isArray(r) ? r : []);
        setItems(merged);
        // 取れ数の自動推定（裁断計算、生地費のみ）
        if (category === "生地費" && productCut.cutHeight && productCut.cutWidth) {
          const auto: Record<string, string> = {};
          for (const m of merged) {
            if (m.fabricWidth) {
              const y = calcYieldPerMeter(productCut, { fabricWidth: m.fabricWidth });
              if (y && y > 0) auto[m.id] = String(y);
            }
          }
          setYields((prev) => ({ ...auto, ...prev }));
        }
      })
      .finally(() => setLoading(false));
  }, [category, search, productCut]);

  // ダイアログを閉じたら入力値をクリア
  useEffect(() => {
    if (!category) {
      setYields({});
      setMeters({});
      setUsages({});
    }
  }, [category]);

  const open = !!category;
  const hasCut = !!(productCut.cutHeight && productCut.cutWidth);
  const isFabricPicker = category === "生地費";

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
              ? hasCut
                ? `※ 取れ数は裁断寸法 (${productCut.cutHeight}×${productCut.cutWidth}cm) と生地巾から自動計算。使用Mは基本情報の裁断で設定します`
                : "※ 生地を選ぶだけでOK。取れ数・使用Mは裁断寸法から自動計算されます（基本情報で裁断寸法・使用Mを設定してください）"
              : "1個あたりの使用数を入力してから「追加」（例: ボタン2個使い → 2）"}
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
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">名前</th>
                    <th className="text-right px-2 py-1.5 font-medium text-gray-500 w-24">単価</th>
                    {isFabricPicker ? (
                      <th className="text-center px-2 py-1.5 font-medium text-gray-500 w-24">巾 / 取れ数</th>
                    ) : (
                      <th className="text-center px-2 py-1.5 font-medium text-gray-500 w-20">使用数 *</th>
                    )}
                    <th className="text-right px-2 py-1.5 font-medium text-gray-500 w-24">1個あたり</th>
                    <th className="px-2 py-1.5 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((m) => {
                    const used = existingMaterialIds.includes(m.id);
                    const unitLabel = m.unitType === "meter" ? "m" : m.unitType === "set" ? "セット" : "個";

                    if (isFabricPicker) {
                      const autoYield = hasCut && m.fabricWidth
                        ? calcYieldPerMeter(productCut, { fabricWidth: m.fabricWidth })
                        : null;
                      const usedM = productCut.usedMeters ?? 1;
                      const perPiece = autoYield && autoYield > 0 ? (m.unitPrice * usedM) / autoYield : 0;
                      return (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-2 py-1.5">
                            <div className="font-medium">{m.name}</div>
                            {m.code && <div className="font-mono text-[10px] text-gray-400">{m.code}</div>}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {m.unitPrice.toLocaleString()}円/{unitLabel}
                          </td>
                          <td className="px-2 py-1.5 text-center text-gray-600">
                            {m.fabricWidth ? `巾${m.fabricWidth}cm` : <span className="text-gray-300 text-[10px]">巾未設定</span>}
                            <div className="text-[10px] text-purple-600">
                              {autoYield != null ? (autoYield > 0 ? `取れ数 ${autoYield}` : "巾不足") : "裁断未設定"}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right text-gray-600">
                            {autoYield && autoYield > 0 ? `${perPiece.toFixed(1)}円` : "-"}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Button
                              size="sm"
                              variant={used ? "outline" : "default"}
                              onClick={() => !used && onPick(m, {})}
                              disabled={used}
                              className="h-7 px-2 text-xs"
                            >
                              {used ? "登録済" : "追加"}
                            </Button>
                          </td>
                        </tr>
                      );
                    }

                    // 資材・梱包資材: 使用数
                    const usageStr = usages[m.id] ?? "1";
                    const usageNum = Number(usageStr);
                    const valid = !used && usageNum > 0;
                    const perPiece = valid ? m.unitPrice * usageNum : 0;
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5">
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
                          {valid ? `${perPiece.toFixed(1)}円` : "-"}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <Button
                            size="sm"
                            variant={valid ? "default" : "outline"}
                            onClick={() => valid && onPick(m, { usageCount: usageNum })}
                            disabled={!valid}
                            className="h-7 px-2 text-xs"
                          >
                            {used ? "登録済" : "追加"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="text-xs text-gray-400">
            <Link href="/materials" className="text-blue-600 hover:underline">資材マスタ</Link>
            で新規登録・編集できます
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 販管費エディタ（営業費・出荷費・管理費） ───
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
  const colCount = isFabric ? 7 : 5;
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr>
          <th className="text-left px-3 py-2 font-medium text-gray-500">名称</th>
          <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">単価</th>
          {isFabric ? (
            <>
              <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">使用M<span className="text-[9px] text-gray-400 block">裁断で設定</span></th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">取れ数<span className="text-[9px] text-gray-400 block">自動</span></th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 w-20">使用数<span className="text-[9px] text-gray-400 block">枚数</span></th>
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

  // 生地: 使用M（商品レベル）と取れ数（裁断寸法+生地巾から自動）
  const usedM = cutCtx?.usedMeters ?? 1;
  const autoYield = isFabric
    ? calcFabricYield(cutCtx?.cutHeight ?? null, cutCtx?.cutWidth ?? null, material.fabricWidth ?? null)
    : null;

  const dirty =
    name !== material.name ||
    Number(unitPrice) !== material.unitPrice ||
    Number(usageCount) !== (material.usageCount ?? 1);

  async function commitAll() {
    if (!dirty) return;
    await onUpdate(material.id, {
      name,
      unitPrice: Number(unitPrice) || 0,
      usageCount: Number(usageCount) || 1,
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitAll();
    }
  }

  // 1個あたり: 生地 = 単価 × 使用M ÷ 取れ数 × 使用数 / 資材 = 単価 × 使用数
  const perPiece = isFabric
    ? (autoYield && autoYield > 0 ? (Number(unitPrice) * usedM) / autoYield * (Number(usageCount) || 1) : 0)
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
          <input
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            onKeyDown={handleKey}
            className="w-full px-2 py-1 text-sm border rounded text-right"
          />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            円{isFabric ? "/m" : ""}
          </span>
        </div>
      </td>
      {isFabric ? (
        <>
          <td className="px-3 py-1 text-right text-gray-600">
            {usedM}m
          </td>
          <td className="px-3 py-1 text-right text-gray-600">
            {autoYield != null ? (
              autoYield > 0 ? `${autoYield}個` : <span className="text-red-500 text-[10px]">巾不足</span>
            ) : (
              <span className="text-gray-300 text-[10px]">裁断/巾未設定</span>
            )}
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
