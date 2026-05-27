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
import { Trash2, Plus, Pencil, Save, X, Link2, BookOpen } from "lucide-react";
import { PRODUCT_SERIES, getSeriesLabel, getSeriesColor } from "@/lib/product-meta";
import {
  calcCostBreakdown,
  calcGrossProfit,
  calcRetailFromCost,
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
  sortOrder: number;
  note: string | null;
}

interface Material {
  id: string;
  materialId: string | null;
  name: string;
  category: string;
  unitPrice: number;
  unitType: string;
  yieldCount: number;
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
  description: string | null;
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
  const [pickerCategory, setPickerCategory] = useState<"fabric" | "other" | null>(null);

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

  async function addStep() {
    await fetch("/api/products/cost-steps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, step: "新工程", unitCost: 0 }),
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

  async function addMaterial(category: "fabric" | "other") {
    await fetch("/api/products/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        name: category === "fabric" ? "新生地" : "新資材",
        category,
        unitPrice: 0,
        unitType: category === "fabric" ? "meter" : "piece",
        yieldCount: 1,
      }),
    });
    load();
  }

  async function addMaterialFromMaster(master: MasterMaterial, yieldCount: number) {
    await fetch("/api/products/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        materialId: master.id,
        yieldCount,
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

  const fabricMaterials = product.materials.filter((m) => m.category === "fabric" || m.category === "生地");
  const otherMaterials = product.materials.filter((m) => m.category !== "fabric" && m.category !== "生地");

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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500">卸単価</p>
                <p className="font-bold text-lg">{product.wholesalePrice ? `${product.wholesalePrice.toLocaleString()}円` : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">在庫</p>
                <p className="font-medium">{product.inventory?.stock ?? 0}</p>
              </div>
              <div className="col-span-2 md:col-span-4 grid grid-cols-3 md:grid-cols-5 gap-3 mt-1 pt-3 border-t">
                <div>
                  <p className="text-xs text-gray-500">営業費</p>
                  <p className="font-medium text-sm">{product.salesCost ? `${product.salesCost.toLocaleString()}円` : "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">梱包費</p>
                  <p className="font-medium text-sm">{product.packagingCost ? `${product.packagingCost.toLocaleString()}円` : "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">運賃</p>
                  <p className="font-medium text-sm">{product.shippingCost ? `${product.shippingCost.toLocaleString()}円` : "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">出荷費</p>
                  <p className="font-medium text-sm">{product.outboundCost ? `${product.outboundCost.toLocaleString()}円` : "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">制作管理</p>
                  <p className="font-medium text-sm">{product.mgmtCost ? `${product.mgmtCost.toLocaleString()}円` : "-"}</p>
                </div>
              </div>
              <div className="col-span-2 md:col-span-4 grid grid-cols-2 gap-3 mt-1 pt-3 border-t">
                <div>
                  <p className="text-xs text-gray-500">裁断 縦 × 横 (cm)</p>
                  <p className="font-medium text-sm">
                    {product.cutHeight && product.cutWidth
                      ? `${product.cutHeight} × ${product.cutWidth} cm`
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">→ 1m取れ数の目安</p>
                  <p className="text-xs text-gray-600">
                    {product.cutHeight && product.cutWidth
                      ? "生地を追加時に巾と組み合わせて計算"
                      : "縦/横を設定してください"}
                  </p>
                </div>
              </div>
              {product.description && (
                <div className="col-span-2 md:col-span-4">
                  <p className="text-xs text-gray-500">備考</p>
                  <p className="text-sm">{product.description}</p>
                </div>
              )}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="border-l-4 border-l-gray-400 pl-3">
              <p className="text-xs text-gray-500">営業費</p>
              <p className="font-bold">{breakdown.salesCost.toLocaleString()}円</p>
            </div>
            <div className="border-l-4 border-l-gray-400 pl-3">
              <p className="text-xs text-gray-500">梱包費</p>
              <p className="font-bold">{breakdown.packagingCost.toLocaleString()}円</p>
            </div>
            <div className="border-l-4 border-l-gray-400 pl-3">
              <p className="text-xs text-gray-500">運賃</p>
              <p className="font-bold">{breakdown.shippingCost.toLocaleString()}円</p>
            </div>
            <div className="border-l-4 border-l-gray-400 pl-3">
              <p className="text-xs text-gray-500">出荷費</p>
              <p className="font-bold">{breakdown.outboundCost.toLocaleString()}円</p>
            </div>
            <div className="border-l-4 border-l-gray-400 pl-3">
              <p className="text-xs text-gray-500">制作管理</p>
              <p className="font-bold">{breakdown.mgmtCost.toLocaleString()}円</p>
            </div>
            <div className="border-l-4 border-l-blue-500 pl-3">
              <p className="text-xs text-gray-500">制作代金</p>
              <p className="font-bold">{breakdown.productionCost.toLocaleString()}円</p>
            </div>
            <div className="border-l-4 border-l-purple-500 pl-3">
              <p className="text-xs text-gray-500">生地代金</p>
              <p className="font-bold">{Math.round(breakdown.fabricCost).toLocaleString()}円</p>
            </div>
            <div className="border-l-4 border-l-orange-500 pl-3">
              <p className="text-xs text-gray-500">その他資材費</p>
              <p className="font-bold">{Math.round(breakdown.otherMaterialCost).toLocaleString()}円</p>
            </div>
            <div className="border-l-4 border-l-red-500 pl-3 col-span-2 md:col-span-4 bg-red-50/30 rounded-r p-2">
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

      {/* 制作工程（複数） */}
      <Card className="bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">制作代金（工程）</CardTitle>
          <Button variant="outline" size="sm" onClick={addStep}>
            <Plus className="size-4 mr-1" /> 工程を追加
          </Button>
        </CardHeader>
        <CardContent>
          {product.costSteps.length === 0 ? (
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
                {product.costSteps.map((s) => (
                  <CostStepRow key={s.id} step={s} onUpdate={updateStep} onDelete={deleteStep} />
                ))}
                <tr className="bg-blue-50/30 font-bold">
                  <td className="px-3 py-2">合計</td>
                  <td className="px-3 py-2 text-right">{breakdown.productionCost.toLocaleString()}円</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* 生地代金 */}
      <Card className="bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">生地代金</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPickerCategory("fabric")}>
              <BookOpen className="size-4 mr-1" /> マスタから
            </Button>
            <Button variant="outline" size="sm" onClick={() => addMaterial("fabric")}>
              <Plus className="size-4 mr-1" /> 手入力
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <MaterialTable
            materials={fabricMaterials}
            onUpdate={updateMaterial}
            onDelete={deleteMaterial}
            totalLabel="生地代金合計"
            totalValue={breakdown.fabricCost}
          />
        </CardContent>
      </Card>

      {/* その他資材費 */}
      <Card className="bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">その他資材費</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPickerCategory("other")}>
              <BookOpen className="size-4 mr-1" /> マスタから
            </Button>
            <Button variant="outline" size="sm" onClick={() => addMaterial("other")}>
              <Plus className="size-4 mr-1" /> 手入力
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <MaterialTable
            materials={otherMaterials}
            onUpdate={updateMaterial}
            onDelete={deleteMaterial}
            totalLabel="その他資材費合計"
            totalValue={breakdown.otherMaterialCost}
          />
        </CardContent>
      </Card>

      <MaterialPickerDialog
        category={pickerCategory}
        onClose={() => setPickerCategory(null)}
        onPick={addMaterialFromMaster}
        existingMaterialIds={product.materials.map((m) => m.materialId).filter((x): x is string => !!x)}
        productCut={{ cutHeight: product.cutHeight, cutWidth: product.cutWidth }}
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
  category: "fabric" | "other" | null;
  onClose: () => void;
  onPick: (m: MasterMaterial, yieldCount: number) => void;
  existingMaterialIds: string[];
  productCut: { cutHeight: number | null; cutWidth: number | null };
}) {
  const [items, setItems] = useState<MasterMaterial[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [yields, setYields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!category) return;
    setLoading(true);
    const params = new URLSearchParams();
    // 旧 "fabric" 引数は新カテゴリ「生地」と互換
    const catParam = category === "fabric" ? "生地" : category;
    params.set("category", catParam);
    if (search) params.set("search", search);
    fetch(`/api/materials?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(Array.isArray(d) ? d : []);
        // 取れ数の自動推定（裁断計算）
        if (category === "fabric" && productCut.cutHeight && productCut.cutWidth) {
          const auto: Record<string, string> = {};
          for (const m of d) {
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
    if (!category) setYields({});
  }, [category]);

  const open = !!category;
  const hasCut = !!(productCut.cutHeight && productCut.cutWidth);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {category === "fabric" ? "生地" : "資材"}を選択
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="名前・コードで検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="text-xs text-gray-500">
            {category === "fabric" && hasCut
              ? `※ 商品の裁断寸法 (${productCut.cutHeight}cm × ${productCut.cutWidth}cm) と生地巾から取れ数を自動推定済み（必要に応じて変更可）`
              : "この商品で1単位（m/個/セット）から何個取れるかを入力してから「追加」してください"}
          </p>
          <div className="max-h-96 overflow-y-auto border rounded-md">
            {loading ? (
              <p className="text-center py-4 text-gray-400 text-sm">読み込み中...</p>
            ) : items.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400">
                <p>登録された{category === "fabric" ? "生地" : "資材"}がありません</p>
                <Link href="/materials" className="text-blue-600 hover:underline text-xs mt-1 inline-block">
                  資材マスタで登録 →
                </Link>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">名前</th>
                    <th className="text-right px-2 py-1.5 font-medium text-gray-500 w-28">単価</th>
                    <th className="text-center px-2 py-1.5 font-medium text-gray-500 w-24">取れ数 *</th>
                    <th className="text-right px-2 py-1.5 font-medium text-gray-500 w-24">1個あたり</th>
                    <th className="px-2 py-1.5 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((m) => {
                    const used = existingMaterialIds.includes(m.id);
                    const yieldStr = yields[m.id] ?? "";
                    const yieldNum = Number(yieldStr);
                    const valid = !used && yieldStr !== "" && yieldNum > 0;
                    const perPiece = valid ? m.unitPrice / yieldNum : 0;
                    const unitLabel = m.unitType === "meter" ? "m" : m.unitType === "set" ? "セット" : "個";
                    const autoYield = hasCut && m.fabricWidth
                      ? calcYieldPerMeter(productCut, { fabricWidth: m.fabricWidth })
                      : null;
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5">
                          <div className="font-medium">{m.name}</div>
                          {m.code && <div className="font-mono text-[10px] text-gray-400">{m.code}</div>}
                          {m.fabricWidth && (
                            <div className="text-[10px] text-purple-600">巾 {m.fabricWidth}cm</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {m.unitPrice.toLocaleString()}円/{unitLabel}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min="1"
                            value={yieldStr}
                            onChange={(e) => setYields((p) => ({ ...p, [m.id]: e.target.value }))}
                            disabled={used}
                            placeholder="例: 50"
                            className={`w-full px-2 py-1 text-sm border rounded text-right disabled:bg-gray-100 ${
                              autoYield && Number(yieldStr) === autoYield ? "bg-purple-50" : ""
                            }`}
                          />
                          {autoYield && Number(yieldStr) === autoYield && (
                            <div className="text-[9px] text-purple-600 text-right">自動</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-600">
                          {valid ? `${perPiece.toFixed(1)}円` : "-"}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <Button
                            size="sm"
                            variant={valid ? "default" : "outline"}
                            onClick={() => valid && onPick(m, yieldNum)}
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
  const [salesCost, setSalesCost] = useState(product.salesCost?.toString() || "");
  const [packagingCost, setPackagingCost] = useState(product.packagingCost?.toString() || "");
  const [shippingCost, setShippingCost] = useState(product.shippingCost?.toString() || "");
  const [outboundCost, setOutboundCost] = useState(product.outboundCost?.toString() || "");
  const [mgmtCost, setMgmtCost] = useState(product.mgmtCost?.toString() || "");
  const [cutHeight, setCutHeight] = useState(product.cutHeight?.toString() || "");
  const [cutWidth, setCutWidth] = useState(product.cutWidth?.toString() || "");
  const [description, setDescription] = useState(product.description || "");
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
          salesCost: salesCost ? Number(salesCost) : null,
          packagingCost: packagingCost ? Number(packagingCost) : null,
          shippingCost: shippingCost ? Number(shippingCost) : null,
          outboundCost: outboundCost ? Number(outboundCost) : null,
          mgmtCost: mgmtCost ? Number(mgmtCost) : null,
          cutHeight: cutHeight ? Number(cutHeight) : null,
          cutWidth: cutWidth ? Number(cutWidth) : null,
          description: description || null,
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
          <label className="text-xs text-gray-500">営業費（円/個）</label>
          <Input type="number" value={salesCost} onChange={(e) => setSalesCost(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500">梱包費（円/個）</label>
          <Input type="number" value={packagingCost} onChange={(e) => setPackagingCost(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500">運賃（円/個）</label>
          <Input type="number" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500">出荷費（円/個）</label>
          <Input type="number" value={outboundCost} onChange={(e) => setOutboundCost(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500">制作管理費（円/個）</label>
          <Input type="number" value={mgmtCost} onChange={(e) => setMgmtCost(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500">裁断 縦（cm）</label>
          <Input type="number" value={cutHeight} onChange={(e) => setCutHeight(e.target.value)} placeholder="例: 15" />
        </div>
        <div>
          <label className="text-xs text-gray-500">裁断 横（cm）</label>
          <Input type="number" value={cutWidth} onChange={(e) => setCutWidth(e.target.value)} placeholder="例: 10" />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">備考</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full border rounded-md px-3 py-2 text-sm resize-y"
        />
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
  onUpdate: (id: string, d: Partial<CostStep>) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(step.step);
  const [cost, setCost] = useState(String(step.unitCost));
  const [note, setNote] = useState(step.note || "");

  function commit(field: string, value: string | number) {
    onUpdate(step.id, { [field]: value });
  }

  return (
    <tr>
      <td className="px-3 py-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== step.step && commit("step", name)}
          className="w-full px-2 py-1 text-sm border rounded"
        />
      </td>
      <td className="px-3 py-1">
        <input
          type="number"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          onBlur={() => Number(cost) !== step.unitCost && commit("unitCost", Number(cost))}
          className="w-full px-2 py-1 text-sm border rounded text-right"
        />
      </td>
      <td className="px-3 py-1">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (step.note || "") && commit("note", note)}
          className="w-full px-2 py-1 text-sm border rounded"
          placeholder="（任意）"
        />
      </td>
      <td className="px-3 py-1 text-right">
        <button onClick={() => onDelete(step.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
          <Trash2 className="size-4" />
        </button>
      </td>
    </tr>
  );
}

// ─── 材料テーブル ───
function MaterialTable({
  materials,
  onUpdate,
  onDelete,
  totalLabel,
  totalValue,
}: {
  materials: Material[];
  onUpdate: (id: string, d: Partial<Material>) => void;
  onDelete: (id: string) => void;
  totalLabel: string;
  totalValue: number;
}) {
  if (materials.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">未登録</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr>
          <th className="text-left px-3 py-2 font-medium text-gray-500">名称</th>
          <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">単価</th>
          <th className="text-center px-3 py-2 font-medium text-gray-500 w-20">単位</th>
          <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">取れ数</th>
          <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">1個あたり</th>
          <th className="px-3 py-2 w-20"></th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {materials.map((m) => (
          <MaterialRow key={m.id} material={m} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
        <tr className="bg-blue-50/30 font-bold">
          <td className="px-3 py-2" colSpan={4}>{totalLabel}</td>
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
}: {
  material: Material;
  onUpdate: (id: string, d: Partial<Material>) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(material.name);
  const [unitPrice, setUnitPrice] = useState(String(material.unitPrice));
  const [unitType, setUnitType] = useState(material.unitType);
  const [yieldCount, setYieldCount] = useState(String(material.yieldCount));

  function commit(field: string, value: string | number) {
    onUpdate(material.id, { [field]: value });
  }

  const perPiece = Number(unitPrice) / (Number(yieldCount) || 1);

  return (
    <tr>
      <td className="px-3 py-1">
        <div className="flex items-center gap-1">
          {material.materialId && (
            <Link2 className="size-3 text-blue-500 shrink-0" aria-label="マスタ連動" />
          )}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== material.name && commit("name", name)}
            className="w-full px-2 py-1 text-sm border rounded"
          />
        </div>
      </td>
      <td className="px-3 py-1">
        <input
          type="number"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          onBlur={() => Number(unitPrice) !== material.unitPrice && commit("unitPrice", Number(unitPrice))}
          className="w-full px-2 py-1 text-sm border rounded text-right"
        />
      </td>
      <td className="px-3 py-1">
        <select
          value={unitType}
          onChange={(e) => {
            setUnitType(e.target.value);
            commit("unitType", e.target.value);
          }}
          className="w-full px-1 py-1 text-sm border rounded"
        >
          {UNIT_TYPES.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1">
        <input
          type="number"
          value={yieldCount}
          onChange={(e) => setYieldCount(e.target.value)}
          onBlur={() => Number(yieldCount) !== material.yieldCount && commit("yieldCount", Number(yieldCount))}
          className="w-full px-2 py-1 text-sm border rounded text-right"
        />
      </td>
      <td className="px-3 py-1 text-right text-gray-700 font-medium">
        {perPiece.toFixed(1)}円
      </td>
      <td className="px-3 py-1 text-right">
        <button onClick={() => onDelete(material.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
          <Trash2 className="size-4" />
        </button>
      </td>
    </tr>
  );
}
