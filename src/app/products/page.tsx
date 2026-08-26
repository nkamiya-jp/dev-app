"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PRODUCT_SERIES, getSeriesLabel, getSeriesColor } from "@/lib/product-meta";
import { Search, Pencil, Plus, Package, Copy, Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { CsvImportDialog } from "@/components/csv-import-dialog";

interface Product {
  id: string;
  code: string;
  name: string;
  series: string | null;
  size: string | null;
  retailPrice: number | null;
  wholesalePrice: number | null;
  cost: number | null;
  workerCost: number | null;
  purchaseCost: number | null;
  salesCost: number | null;
  outboundCost: number | null;
  mgmtCost: number | null;
  productionCost: number;
  production: { 口金: number; 貼り: number; 縫製: number; その他: number };
  breakdown?: {
    productionCost: number;
    cuttingCost: number;
    fabricCost: number;
    materialCost: number;
    packagingMaterialCost: number;
    purchaseCost: number;
    laborCost: number;
  };
  description: string | null;
  active: boolean;
  inventory?: { stock: number } | null;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  // 一覧の表示モード：工程別（編集向け）/ 種別原価（カテゴリ別）
  const [view, setView] = useState<"process" | "category">("process");
  // 比較用に選んだ商品
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (seriesFilter) params.set("series", seriesFilter);
    params.set("includeInactive", "1");
    const res = await fetch(`/api/products?${params.toString()}`);
    setProducts(await res.json());
  }, [search, seriesFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // 一覧セルの直接編集：商品フィールド（卸価格・仕入単価・内職・販管費）を保存
  async function saveField(id: string, field: string, value: number | null) {
    // 楽観的更新（すぐ画面に反映）
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    await fetch(`/api/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    load();
  }

  // 一覧セルの直接編集：制作費の固定工程（口金/貼り/縫製/その他）を保存
  async function saveProductionStep(id: string, step: "口金" | "貼り" | "縫製" | "その他", value: number | null) {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const production = { ...p.production, [step]: value ?? 0 };
        const productionCost = production.口金 + production.貼り + production.縫製 + production.その他;
        return { ...p, production, productionCost };
      })
    );
    await fetch("/api/products/production-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: id, step, value }),
    });
    load();
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.get("code"),
        name: form.get("name"),
        series: form.get("series") || null,
        size: form.get("size") || null,
        wholesalePrice: form.get("wholesalePrice") ? Number(form.get("wholesalePrice")) : null,
        workerCost: form.get("workerCost") ? Number(form.get("workerCost")) : null,
        description: form.get("description") || null,
      }),
    });
    setCreateOpen(false);
    load();
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editTarget) return;
    const form = new FormData(e.currentTarget);
    await fetch("/api/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editTarget.id,
        code: form.get("code"),
        name: form.get("name"),
        series: form.get("series") || null,
        size: form.get("size") || null,
        wholesalePrice: form.get("wholesalePrice") ? Number(form.get("wholesalePrice")) : null,
        workerCost: form.get("workerCost") ? Number(form.get("workerCost")) : null,
        description: form.get("description") || null,
        active: form.get("active") === "on",
      }),
    });
    setEditTarget(null);
    load();
  }

  async function reorderProduct(id: string, direction: "up" | "down") {
    // 並び替えはシリーズグループ内で行う（一覧はシリーズ別に表示しているため）
    const res = await fetch("/api/products/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, direction, withinSeries: true }),
    });
    if (!res.ok) {
      alert("並び替えに失敗しました。時間をおいて再度お試しください。");
      return;
    }
    load();
  }

  async function moveProduct(id: string, targetId: string) {
    if (id === targetId) return;
    const res = await fetch("/api/products/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, targetId, withinSeries: true }),
    });
    if (!res.ok) {
      alert("並び替えに失敗しました。時間をおいて再度お試しください。");
      return;
    }
    load();
  }

  async function duplicateProduct(id: string, name: string) {
    if (!confirm(`「${name}」を複製しますか？（原価工程・生地・資材もコピーされます）`)) return;
    const res = await fetch(`/api/products/${id}/duplicate`, { method: "POST" });
    if (res.ok) load();
    else alert("複製に失敗しました");
  }

  async function deleteProduct(id: string, name: string, active: boolean) {
    // アクティブ商品はまず非アクティブ化、非アクティブ商品は完全削除を試みる
    if (active) {
      if (!confirm(`「${name}」を取扱終了（非表示）にしますか？`)) return;
      await fetch("/api/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      load();
      return;
    }
    if (!confirm(`「${name}」を完全に削除しますか？\n（受注・出荷・製造で使われている場合は取扱終了のままになります）`)) return;
    const res = await fetch("/api/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hard: true }),
    });
    const data = await res.json();
    if (data.deleted === "soft" && data.deps) {
      alert(`他データ（受注/出荷/製造 計${data.deps}件）で使用中のため、完全削除できません。取扱終了のままにしました。`);
    }
    load();
  }

  // シリーズごとにグループ化
  const grouped = PRODUCT_SERIES.map((s) => ({
    series: s,
    items: products.filter((p) => p.series === s.id),
  })).filter((g) => g.items.length > 0);
  const noSeries = products.filter((p) => !p.series);
  const compareItems = products.filter((p) => selected.has(p.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">商品マスタ</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
            <Input
              placeholder="商品名・コードで検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-full sm:w-56"
            />
          </div>
          <select
            value={seriesFilter}
            onChange={(e) => setSeriesFilter(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="">全シリーズ</option>
            {PRODUCT_SERIES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          {/* 表示モード切替 */}
          <div className="inline-flex rounded-md border overflow-hidden text-sm">
            <button
              onClick={() => setView("process")}
              className={`px-3 py-2 ${view === "process" ? "bg-zinc-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              title="口金/貼り/縫製などの工程別・編集向け"
            >
              工程別
            </button>
            <button
              onClick={() => setView("category")}
              className={`px-3 py-2 border-l ${view === "category" ? "bg-zinc-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              title="生地費/資材費などの種別原価（カテゴリ別）"
            >
              種別原価
            </button>
          </div>
          <CsvImportDialog
            title="商品マスタ"
            endpoint="/api/products/import"
            onDone={load}
            columns={[
              { key: "code", label: "コード", required: true, example: "西2.6" },
              { key: "name", label: "商品名", required: true, example: "西陣 2.6寸がま口" },
              { key: "series", label: "シリーズ", example: "西陣 / 仕入" },
              { key: "size", label: "サイズ", example: "2.6寸" },
              { key: "retailPrice", label: "上代", example: "1600" },
              { key: "wholesalePrice", label: "卸単価", example: "800" },
              { key: "purchaseCost", label: "仕入単価", example: "500" },
              { key: "salesCost", label: "営業費", example: "20" },
              { key: "outboundCost", label: "出荷費", example: "30" },
              { key: "mgmtCost", label: "管理費", example: "8" },
              { key: "cutHeight", label: "裁断縦", example: "10" },
              { key: "cutWidth", label: "裁断横", example: "12" },
              { key: "usedMeters", label: "使用M", example: "0.9" },
              { key: "leadText", label: "リード文", example: "手のひらサイズのがま口" },
              { key: "tags", label: "タグ", example: "がま口,西陣" },
            ]}
          />
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="size-4 mr-1" /> 商品を追加
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新しい商品</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">商品コード *</label>
                  <Input name="code" required placeholder="例: 西2.6" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">商品名 *</label>
                  <Input name="name" required placeholder="例: 西陣 2.6寸がま口" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">シリーズ</label>
                    <select name="series" className="w-full border rounded-md px-3 py-2 text-sm">
                      <option value="">未設定</option>
                      {PRODUCT_SERIES.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">サイズ</label>
                    <Input name="size" placeholder="例: 2.6寸" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">卸単価（円）</label>
                    <Input name="wholesalePrice" type="number" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">内職単価（円）</label>
                    <Input name="workerCost" type="number" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">備考</label>
                  <textarea name="description" rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
                </div>
                <Button type="submit" className="w-full">追加</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {products.length === 0 && (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-12 text-center text-gray-400">
            <Package className="size-12 mx-auto mb-3 text-gray-300" />
            <p>商品が登録されていません</p>
            <p className="text-xs mt-1">右上の「商品を追加」から登録してください</p>
          </CardContent>
        </Card>
      )}

      {compareItems.length >= 1 && (
        <CostComparePanel items={compareItems} onClear={() => setSelected(new Set())} />
      )}

      <div className="space-y-6">
        {grouped.map(({ series, items }) => (
          <ProductGroup
            key={series.id}
            title={series.label}
            color={series.color}
            items={items}
            selected={selected}
            view={view}
            onToggleSelect={toggleSelect}
            onEdit={setEditTarget}
            onDuplicate={duplicateProduct}
            onDelete={deleteProduct}
            onReorder={reorderProduct}
            onMove={moveProduct}
            onSaveField={saveField}
            onSaveStep={saveProductionStep}
          />
        ))}
        {noSeries.length > 0 && (
          <ProductGroup
            title="未分類"
            color="bg-gray-100 text-gray-700"
            items={noSeries}
            selected={selected}
            view={view}
            onToggleSelect={toggleSelect}
            onEdit={setEditTarget}
            onDuplicate={duplicateProduct}
            onDelete={deleteProduct}
            onReorder={reorderProduct}
            onMove={moveProduct}
            onSaveField={saveField}
            onSaveStep={saveProductionStep}
          />
        )}
      </div>

      {/* 編集ダイアログ */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>商品を編集</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <form onSubmit={handleEdit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">商品コード *</label>
                <Input name="code" required defaultValue={editTarget.code} />
              </div>
              <div>
                <label className="text-xs text-gray-500">商品名 *</label>
                <Input name="name" required defaultValue={editTarget.name} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">シリーズ</label>
                  <select name="series" defaultValue={editTarget.series || ""} className="w-full border rounded-md px-3 py-2 text-sm">
                    <option value="">未設定</option>
                    {PRODUCT_SERIES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">サイズ</label>
                  <Input name="size" defaultValue={editTarget.size || ""} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">卸単価（円）</label>
                  <Input name="wholesalePrice" type="number" defaultValue={editTarget.wholesalePrice ?? ""} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">内職単価（円）</label>
                  <Input name="workerCost" type="number" defaultValue={editTarget.workerCost ?? ""} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">備考</label>
                <textarea name="description" rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-y" defaultValue={editTarget.description || ""} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={editTarget.active} />
                有効（取扱中）
              </label>
              <Button type="submit" className="w-full">保存</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 種別原価の比較パネル（1つ選択＝内訳表示、2つ以上＝横並び比較）
const COMPARE_ROWS = [
  { key: "productionCost", label: "制作費", cls: "text-blue-700" },
  { key: "cuttingCost", label: "裁断費", cls: "text-teal-700" },
  { key: "fabricCost", label: "生地費", cls: "text-purple-700" },
  { key: "materialCost", label: "資材費", cls: "text-amber-700" },
  { key: "packagingMaterialCost", label: "梱包資材費", cls: "text-pink-700" },
  { key: "purchaseCost", label: "仕入", cls: "text-emerald-700" },
  { key: "laborCost", label: "販管費", cls: "text-gray-600" },
] as const;

function CostComparePanel({ items, onClear }: { items: Product[]; onClear: () => void }) {
  const val = (p: Product, key: string) =>
    p.breakdown ? ((p.breakdown as unknown as Record<string, number>)[key] ?? 0) : 0;
  const multi = items.length > 1;
  const ratio = (p: Product) =>
    p.retailPrice && p.retailPrice > 0 && p.cost != null ? (p.cost / p.retailPrice) * 100 : null;

  return (
    <Card className="bg-white shadow-sm border-blue-300">
      <CardContent className="p-0 overflow-x-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-blue-50/60">
          <p className="text-sm font-medium text-blue-900">
            {multi ? `商品比較（${items.length}商品）` : "原価内訳"}
          </p>
          <Button variant="outline" size="sm" onClick={onClear}>クリア</Button>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-3 py-2 font-medium text-gray-500 min-w-[92px] sticky left-0 bg-gray-50">項目</th>
              {items.map((it) => (
                <th key={it.id} className="text-right px-3 py-2 font-medium min-w-[110px]">
                  <Link href={`/products/${it.id}`} className="text-blue-600 hover:underline">{it.name}</Link>
                  <div className="text-[10px] font-mono text-gray-400 font-normal">{it.code}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {COMPARE_ROWS.map((r) => {
              const vals = items.map((it) => val(it, r.key));
              const mx = Math.max(0, ...vals);
              return (
                <tr key={r.key}>
                  <td className="px-3 py-1.5 sticky left-0 bg-white"><span className={r.cls}>{r.label}</span></td>
                  {items.map((it, i) => {
                    const v = vals[i];
                    const isMax = multi && v > 0 && v === mx;
                    return (
                      <td key={it.id} className={`px-3 py-1.5 text-right ${isMax ? "font-bold text-red-600" : "text-gray-700"}`}>
                        {v.toLocaleString()}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t-2 bg-gray-50/60">
              <td className="px-3 py-1.5 font-bold text-gray-700 sticky left-0 bg-gray-50/60">合計原価</td>
              {(() => {
                const vals = items.map((it) => it.cost ?? 0);
                const mx = Math.max(0, ...vals);
                return items.map((it, i) => {
                  const v = vals[i];
                  const isMax = multi && v > 0 && v === mx;
                  return (
                    <td key={it.id} className={`px-3 py-1.5 text-right font-bold ${isMax ? "text-red-600" : "text-gray-900"}`}>
                      {v.toLocaleString()}
                    </td>
                  );
                });
              })()}
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-gray-600 sticky left-0 bg-white">参考価格(上代)</td>
              {items.map((it) => (
                <td key={it.id} className="px-3 py-1.5 text-right text-gray-600">
                  {it.retailPrice ? it.retailPrice.toLocaleString() : "-"}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-gray-600 sticky left-0 bg-white">原価率(上代)</td>
              {(() => {
                const vals = items.map((it) => ratio(it) ?? 0);
                const mx = Math.max(0, ...vals);
                return items.map((it) => {
                  const rr = ratio(it);
                  const isMax = multi && rr != null && rr > 0 && rr === mx;
                  return (
                    <td key={it.id} className={`px-3 py-1.5 text-right ${isMax ? "font-bold text-red-600" : "text-gray-500"}`}>
                      {rr != null ? `${rr.toFixed(0)}%` : "-"}
                    </td>
                  );
                });
              })()}
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ProductGroup({
  title,
  color,
  items,
  view,
  selected,
  onToggleSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onReorder,
  onMove,
  onSaveField,
  onSaveStep,
}: {
  title: string;
  color: string;
  items: Product[];
  view: "process" | "category";
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onEdit: (p: Product) => void;
  onDuplicate: (id: string, name: string) => void;
  onDelete: (id: string, name: string, active: boolean) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
  onMove: (id: string, targetId: string) => void;
  onSaveField: (id: string, field: string, value: number | null) => void;
  onSaveStep: (id: string, step: "口金" | "貼り" | "縫製" | "その他", value: number | null) => void;
}) {
  // 並び替え：⠿グリップをドラッグ＆ドロップ、または↑↓ボタンで1段ずつ。
  // HTML5標準のドラッグを使う（グリップだけを draggable にして入力セルと競合させない）。
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const draggingItem = items.find((it) => it.id === dragId) || null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge className={color}>{title}</Badge>
        <span className="text-sm text-gray-500">{items.length}件</span>
        {draggingItem ? (
          <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
            「{draggingItem.name}」をドラッグ中 — 移動先の行に落としてください
          </span>
        ) : (
          <span className="text-[11px] text-gray-400 hidden md:inline">（⠿をドラッグして並び替え、または↑↓）</span>
        )}
      </div>
      <div className="bg-white shadow-sm border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-gray-500">
            {view === "category" ? (
              <tr className="border-b">
                <th className="w-8 px-1 py-2"></th>
                <th className="w-14 px-1 py-2"></th>
                <th className="text-left px-2 py-2 font-medium w-20">コード</th>
                <th className="text-left px-2 py-2 font-medium min-w-[140px]">商品名</th>
                <th className="text-right px-2 py-2 font-medium w-20">参考価格<span className="block text-[10px] font-normal text-gray-400">上代</span></th>
                <th className="text-right px-1 py-2 font-medium text-[11px] text-blue-700 border-l w-12">制作費</th>
                <th className="text-right px-1 py-2 font-medium text-[11px] text-teal-700 w-12">裁断費</th>
                <th className="text-right px-1 py-2 font-medium text-[11px] text-purple-700 w-12">生地費</th>
                <th className="text-right px-1 py-2 font-medium text-[11px] text-amber-700 w-12">資材費</th>
                <th className="text-right px-1 py-2 font-medium text-[11px] text-pink-700 w-12">梱包<br />資材費</th>
                <th className="text-right px-1 py-2 font-medium text-[11px] text-emerald-700 w-12">仕入</th>
                <th className="text-right px-1 py-2 font-medium text-[11px] text-gray-600 w-12">販管費</th>
                <th className="text-right px-2 py-2 font-medium bg-emerald-50/60 border-l w-20">原価<span className="block text-[10px] font-normal text-gray-400">合計</span></th>
                <th className="text-right px-2 py-2 font-medium w-14">原価率<span className="block text-[10px] font-normal text-gray-400">上代</span></th>
                <th className="w-24 px-2 py-2"></th>
              </tr>
            ) : (
              <>
                <tr className="border-b">
                  <th className="w-8 px-1 pt-2" rowSpan={2}></th>
                  <th className="w-14 px-1 pt-2"></th>
                  <th className="text-left px-2 pt-2 font-medium w-20" rowSpan={2}>コード</th>
                  <th className="text-left px-2 pt-2 font-medium min-w-[140px]" rowSpan={2}>商品名</th>
                  <th className="text-right px-2 pt-2 font-medium w-24" rowSpan={2}>参考価格<span className="block text-[10px] font-normal text-gray-400">上代</span></th>
                  <th className="text-right px-2 pt-2 font-medium w-20 bg-emerald-50/60" rowSpan={2}>原価<span className="block text-[10px] font-normal text-gray-400">合計</span></th>
                  <th className="text-center px-1 py-1 font-medium bg-blue-50/60 border-l" colSpan={4}>制作費</th>
                  <th className="text-right px-2 pt-2 font-medium w-14" rowSpan={2}>内職</th>
                  <th className="text-center px-1 py-1 font-medium bg-slate-50 border-l" colSpan={3}>販管費</th>
                  <th className="text-right px-2 pt-2 font-medium w-14 border-l" rowSpan={2}>在庫</th>
                  <th className="w-24 px-2 pt-2" rowSpan={2}></th>
                </tr>
                <tr>
                  <th></th>
                  <th className="text-right px-1 py-1 font-normal text-[11px] w-12 bg-blue-50/40 border-l">口金</th>
                  <th className="text-right px-1 py-1 font-normal text-[11px] w-12 bg-blue-50/40">貼り</th>
                  <th className="text-right px-1 py-1 font-normal text-[11px] w-12 bg-blue-50/40">縫製</th>
                  <th className="text-right px-1 py-1 font-normal text-[11px] w-12 bg-blue-50/40">その他</th>
                  <th className="text-right px-1 py-1 font-normal text-[11px] w-12 bg-slate-50 border-l">営業</th>
                  <th className="text-right px-1 py-1 font-normal text-[11px] w-12 bg-slate-50">出荷</th>
                  <th className="text-right px-1 py-1 font-normal text-[11px] w-12 bg-slate-50">管理</th>
                </tr>
              </>
            )}
          </thead>
          <tbody className="divide-y">
            {items.map((p, idx) => (
              <tr
                key={p.id}
                onDragOver={(e) => {
                  if (dragId && dragId !== p.id) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (overId !== p.id) setOverId(p.id);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== p.id) onMove(dragId, p.id);
                  setDragId(null);
                  setOverId(null);
                }}
                className={`hover:bg-gray-50 ${!p.active ? "opacity-50" : ""} ${dragId === p.id ? "opacity-40" : ""} ${overId === p.id && dragId ? "bg-blue-50 outline outline-2 outline-blue-400" : ""} ${selected.has(p.id) ? "bg-blue-50/50" : ""}`}
              >
                <td className="px-1 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => onToggleSelect(p.id)}
                    className="size-4 align-middle"
                  />
                </td>
                <td className="px-1 py-1">
                  <div className="flex items-center justify-center gap-0.5">
                    <div
                      draggable
                      onDragStart={(e) => {
                        setDragId(p.id);
                        e.dataTransfer.effectAllowed = "move";
                        try { e.dataTransfer.setData("text/plain", p.id); } catch { /* noop */ }
                      }}
                      onDragEnd={() => { setDragId(null); setOverId(null); }}
                      className="cursor-grab active:cursor-grabbing rounded p-0.5 text-gray-300 hover:text-gray-700 hover:bg-gray-100"
                      title="ドラッグして並び替え"
                    >
                      <GripVertical className="size-4" />
                    </div>
                    <div className="flex flex-col">
                      <button
                        onClick={() => onReorder(p.id, "up")}
                        disabled={idx === 0}
                        className="text-gray-300 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="上へ"
                      >
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button
                        onClick={() => onReorder(p.id, "down")}
                        disabled={idx === items.length - 1}
                        className="text-gray-300 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="下へ"
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-1.5 font-mono text-xs text-gray-500">{p.code}</td>
                <td className="px-2 py-1.5">
                  <Link href={`/products/${p.id}`} className="text-blue-600 hover:underline font-medium">
                    {p.name}
                  </Link>
                  {p.size && <span className="text-[10px] text-gray-400 ml-1">{p.size}</span>}
                  {!p.active && <Badge variant="outline" className="ml-2 text-[10px]">取扱終了</Badge>}
                </td>
                {view === "category" ? (
                  <>
                    <EditCell value={p.retailPrice} onSave={(v) => onSaveField(p.id, "retailPrice", v)} className="font-medium" />
                    <td className="px-1 py-1.5 text-right text-gray-700 border-l tabular-nums">{p.breakdown ? p.breakdown.productionCost.toLocaleString() : "-"}</td>
                    <td className="px-1 py-1.5 text-right text-gray-700 tabular-nums">{p.breakdown ? p.breakdown.cuttingCost.toLocaleString() : "-"}</td>
                    <td className="px-1 py-1.5 text-right text-gray-700 tabular-nums">{p.breakdown ? p.breakdown.fabricCost.toLocaleString() : "-"}</td>
                    <td className="px-1 py-1.5 text-right text-gray-700 tabular-nums">{p.breakdown ? p.breakdown.materialCost.toLocaleString() : "-"}</td>
                    <td className="px-1 py-1.5 text-right text-gray-700 tabular-nums">{p.breakdown ? p.breakdown.packagingMaterialCost.toLocaleString() : "-"}</td>
                    <td className="px-1 py-1.5 text-right text-gray-700 tabular-nums">{p.breakdown ? p.breakdown.purchaseCost.toLocaleString() : "-"}</td>
                    <td className="px-1 py-1.5 text-right text-gray-700 tabular-nums">{p.breakdown ? p.breakdown.laborCost.toLocaleString() : "-"}</td>
                    <td className="px-2 py-1.5 text-right font-medium bg-emerald-50/40 border-l tabular-nums">{p.cost != null && p.cost > 0 ? p.cost.toLocaleString() : "-"}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${p.retailPrice && p.cost != null && p.retailPrice > 0 && (p.cost / p.retailPrice) * 100 > 40 ? "text-red-600 font-medium" : "text-gray-500"}`}>
                      {p.retailPrice && p.cost != null && p.retailPrice > 0 ? `${Math.round((p.cost / p.retailPrice) * 100)}%` : "-"}
                    </td>
                  </>
                ) : (
                  <>
                    <EditCell value={p.retailPrice} onSave={(v) => onSaveField(p.id, "retailPrice", v)} className="font-medium" />
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums bg-emerald-50/40">
                      {p.cost != null && p.cost > 0 ? p.cost.toLocaleString() : "-"}
                    </td>
                    <EditCell value={p.production.口金 || null} onSave={(v) => onSaveStep(p.id, "口金", v)} className="bg-blue-50/20 border-l" />
                    <EditCell value={p.production.貼り || null} onSave={(v) => onSaveStep(p.id, "貼り", v)} className="bg-blue-50/20" />
                    <EditCell value={p.production.縫製 || null} onSave={(v) => onSaveStep(p.id, "縫製", v)} className="bg-blue-50/20" />
                    <EditCell value={p.production.その他 || null} onSave={(v) => onSaveStep(p.id, "その他", v)} className="bg-blue-50/20" />
                    <EditCell value={p.workerCost} onSave={(v) => onSaveField(p.id, "workerCost", v)} />
                    <EditCell value={p.salesCost} onSave={(v) => onSaveField(p.id, "salesCost", v)} className="bg-slate-50/40 border-l" />
                    <EditCell value={p.outboundCost} onSave={(v) => onSaveField(p.id, "outboundCost", v)} className="bg-slate-50/40" />
                    <EditCell value={p.mgmtCost} onSave={(v) => onSaveField(p.id, "mgmtCost", v)} className="bg-slate-50/40" />
                    <td className="px-2 py-1.5 text-right text-gray-600 border-l">
                      {p.inventory ? p.inventory.stock : "-"}
                    </td>
                  </>
                )}
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-0.5">
                    <button onClick={() => onEdit(p)} className="text-gray-400 hover:text-gray-700 p-1" title="編集">
                      <Pencil className="size-4" />
                    </button>
                    <button onClick={() => onDuplicate(p.id, p.name)} className="text-gray-400 hover:text-blue-600 p-1" title="複製">
                      <Copy className="size-4" />
                    </button>
                    <button onClick={() => onDelete(p.id, p.name, p.active)} className="text-gray-400 hover:text-red-600 p-1" title={p.active ? "取扱終了にする" : "完全に削除"}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 一覧セルの直接編集（数値）。クリックで入力、blur/Enterで保存。
function EditCell({
  value,
  onSave,
  className = "",
}: {
  value: number | null;
  onSave: (v: number | null) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");

  function start() {
    setVal(value != null ? String(value) : "");
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    const n = val === "" ? null : Math.round(Number(val));
    if ((n ?? null) !== (value ?? null) && !(val !== "" && isNaN(Number(val)))) {
      onSave(n);
    }
  }

  return (
    <td
      className={`px-1 py-1 text-right text-xs ${className}`}
      // 行ドラッグに吸われないように
      onMouseDown={(e) => e.stopPropagation()}
    >
      {editing ? (
        <input
          autoFocus
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-16 px-1 py-0.5 border rounded text-right"
        />
      ) : (
        <button
          onClick={start}
          className="w-full text-right px-1 py-0.5 rounded hover:bg-white hover:ring-1 hover:ring-gray-300 text-gray-700"
          title="クリックで編集"
        >
          {value ? value.toLocaleString() : <span className="text-gray-300">-</span>}
        </button>
      )}
    </td>
  );
}
