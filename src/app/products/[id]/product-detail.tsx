"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Trash2, Plus, Pencil, Save, X } from "lucide-react";
import { PRODUCT_SERIES, getSeriesLabel, getSeriesColor } from "@/lib/product-meta";
import {
  calcCostBreakdown,
  calcGrossProfit,
  calcRetailFromCost,
  buildPriceMatrix,
  DEFAULT_COST_RATIO,
} from "@/lib/product-cost";

interface CostStep {
  id: string;
  step: string;
  unitCost: number;
  sortOrder: number;
  note: string | null;
}

interface Material {
  id: string;
  name: string;
  category: string;
  unitPrice: number;
  unitType: string;
  yieldCount: number;
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
    costSteps: product.costSteps,
    materials: product.materials,
  });
  const sellPrice = product.wholesalePrice ?? 0;
  const { profit, rate } = calcGrossProfit(breakdown.total, sellPrice);

  // 上代と卸価格マトリクス
  const cost = breakdown.total;
  const costRatio = product.costRatio ?? DEFAULT_COST_RATIO;
  const retail = product.retailPrice ?? 0;
  const actualCostRatio = retail > 0 ? cost / retail : 0;
  const priceMatrix = retail > 0 ? buildPriceMatrix(retail, cost) : [];
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

  const fabricMaterials = product.materials.filter((m) => m.category === "fabric");
  const otherMaterials = product.materials.filter((m) => m.category !== "fabric");

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
                <p className="text-xs text-gray-500">営業費</p>
                <p className="font-medium">{product.salesCost ? `${product.salesCost.toLocaleString()}円` : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">梱包費</p>
                <p className="font-medium">{product.packagingCost ? `${product.packagingCost.toLocaleString()}円` : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">在庫</p>
                <p className="font-medium">{product.inventory?.stock ?? 0}</p>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border-l-4 border-l-gray-400 pl-3">
              <p className="text-xs text-gray-500">営業費</p>
              <p className="font-bold">{breakdown.salesCost.toLocaleString()}円</p>
            </div>
            <div className="border-l-4 border-l-gray-400 pl-3">
              <p className="text-xs text-gray-500">梱包費</p>
              <p className="font-bold">{breakdown.packagingCost.toLocaleString()}円</p>
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

      {/* 上代と卸価格マトリクス */}
      <Card className="bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">上代・卸価格</CardTitle>
        </CardHeader>
        <CardContent>
          <PriceSettings
            cost={cost}
            retail={retail}
            costRatio={costRatio}
            actualCostRatio={actualCostRatio}
            suggestedRetail={suggestedRetail}
            onSaveRetail={(v) => saveBasic({ retailPrice: v })}
            onSaveCostRatio={(v) => saveBasic({ costRatio: v })}
          />

          {priceMatrix.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2">顧客掛率別の卸価格と粗利</p>
              <table className="w-full text-sm border">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-center px-3 py-2 font-medium text-gray-500 border-r w-20">掛率</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">卸価格</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">粗利</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">粗利率</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {priceMatrix.map((row) => (
                    <tr key={row.rate} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-center font-medium border-r">{row.ratePct}%</td>
                      <td className="px-3 py-2 text-right font-bold border-r">{row.wholesalePrice.toLocaleString()}円</td>
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
                ※ 卸価格 = 上代 × 掛率 / 粗利 = 卸価格 − 原価
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4 mt-2">上代を設定すると掛率別の卸価格が表示されます</p>
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
          <Button variant="outline" size="sm" onClick={() => addMaterial("fabric")}>
            <Plus className="size-4 mr-1" /> 生地を追加
          </Button>
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
          <Button variant="outline" size="sm" onClick={() => addMaterial("other")}>
            <Plus className="size-4 mr-1" /> 資材を追加
          </Button>
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
  const [salesCost, setSalesCost] = useState(product.salesCost?.toString() || "");
  const [packagingCost, setPackagingCost] = useState(product.packagingCost?.toString() || "");
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
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== material.name && commit("name", name)}
          className="w-full px-2 py-1 text-sm border rounded"
        />
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
