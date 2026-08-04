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
  wholesalePrice: number | null;
  workerCost: number | null;
  purchaseCost: number | null;
  salesCost: number | null;
  outboundCost: number | null;
  mgmtCost: number | null;
  productionCost: number;
  production: { 口金: number; 貼り: number; 縫製: number; その他: number };
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
    await fetch("/api/products/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, direction, withinSeries: false }),
    });
    load();
  }

  async function moveProduct(id: string, targetId: string) {
    if (id === targetId) return;
    await fetch("/api/products/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, targetId, withinSeries: false }),
    });
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

      <div className="space-y-6">
        {grouped.map(({ series, items }) => (
          <ProductGroup
            key={series.id}
            title={series.label}
            color={series.color}
            items={items}
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

function ProductGroup({
  title,
  color,
  items,
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
  onEdit: (p: Product) => void;
  onDuplicate: (id: string, name: string) => void;
  onDelete: (id: string, name: string, active: boolean) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
  onMove: (id: string, targetId: string) => void;
  onSaveField: (id: string, field: string, value: number | null) => void;
  onSaveStep: (id: string, step: "口金" | "貼り" | "縫製" | "その他", value: number | null) => void;
}) {
  // 2クリック方式の並び替え：⠿で「掴む」→ 移動先の行の「ここへ」で確定。
  // ドラッグは環境差で不安定なため、確実に動くクリック操作にしている。
  const [movingId, setMovingId] = useState<string | null>(null);
  const movingItem = items.find((it) => it.id === movingId) || null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge className={color}>{title}</Badge>
        <span className="text-sm text-gray-500">{items.length}件</span>
        {movingItem ? (
          <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
            「{movingItem.name}」を移動中 — 移動先の行の「ここへ」を押す
            <button onClick={() => setMovingId(null)} className="ml-2 text-gray-500 hover:text-red-600 underline">キャンセル</button>
          </span>
        ) : (
          <span className="text-[11px] text-gray-400 hidden md:inline">（⠿で掴む→移動先の「ここへ」で並び替え、または↑↓）</span>
        )}
      </div>
      <div className="bg-white shadow-sm border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-gray-500">
            <tr className="border-b">
              <th className="w-14 px-1 pt-2"></th>
              <th className="text-left px-2 pt-2 font-medium w-20" rowSpan={2}>コード</th>
              <th className="text-left px-2 pt-2 font-medium min-w-[140px]" rowSpan={2}>商品名</th>
              <th className="text-right px-2 pt-2 font-medium w-20" rowSpan={2}>卸価格</th>
              <th className="text-right px-2 pt-2 font-medium w-20 bg-emerald-50/60" rowSpan={2}>仕入単価</th>
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
          </thead>
          <tbody className="divide-y">
            {items.map((p, idx) => (
              <tr
                key={p.id}
                className={`hover:bg-gray-50 ${!p.active ? "opacity-50" : ""} ${movingId === p.id ? "bg-blue-50 outline outline-2 outline-blue-400" : ""}`}
              >
                <td className="px-1 py-1">
                  {movingId && movingId !== p.id ? (
                    // 移動先候補：ここへ移動
                    <button
                      onClick={() => { onMove(movingId, p.id); setMovingId(null); }}
                      className="text-[10px] text-white bg-blue-500 hover:bg-blue-600 rounded px-1.5 py-1 whitespace-nowrap"
                      title="ここへ移動"
                    >
                      ここへ
                    </button>
                  ) : (
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        onClick={() => setMovingId(movingId === p.id ? null : p.id)}
                        className={`rounded p-0.5 ${movingId === p.id ? "text-blue-600 bg-blue-100" : "text-gray-300 hover:text-gray-700 hover:bg-gray-100"}`}
                        title={movingId === p.id ? "移動をキャンセル" : "掴んで移動（クリック→移動先を選ぶ）"}
                      >
                        <GripVertical className="size-4" />
                      </button>
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
                  )}
                </td>
                <td className="px-2 py-1.5 font-mono text-xs text-gray-500">{p.code}</td>
                <td className="px-2 py-1.5">
                  <Link href={`/products/${p.id}`} className="text-blue-600 hover:underline font-medium">
                    {p.name}
                  </Link>
                  {p.size && <span className="text-[10px] text-gray-400 ml-1">{p.size}</span>}
                  {!p.active && <Badge variant="outline" className="ml-2 text-[10px]">取扱終了</Badge>}
                </td>
                <EditCell value={p.wholesalePrice} onSave={(v) => onSaveField(p.id, "wholesalePrice", v)} className="font-medium" />
                <EditCell value={p.purchaseCost} onSave={(v) => onSaveField(p.id, "purchaseCost", v)} className="bg-emerald-50/40" />
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
