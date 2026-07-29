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
import { Search, Pencil, Plus, Package, Copy, Trash2, ChevronUp, ChevronDown } from "lucide-react";
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
}: {
  title: string;
  color: string;
  items: Product[];
  onEdit: (p: Product) => void;
  onDuplicate: (id: string, name: string) => void;
  onDelete: (id: string, name: string, active: boolean) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
  onMove: (id: string, targetId: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Badge className={color}>{title}</Badge>
        <span className="text-sm text-gray-500">{items.length}件</span>
        <span className="text-[11px] text-gray-400 hidden md:inline">（行をドラッグ、または↑↓で並び替え）</span>
      </div>
      <div className="bg-white shadow-sm border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-gray-500">
            <tr className="border-b">
              <th className="w-10 px-1 pt-2"></th>
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
                draggable
                onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== p.id) setOverId(p.id); }}
                onDragLeave={() => setOverId((cur) => (cur === p.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== p.id) onMove(dragId, p.id);
                  setDragId(null);
                  setOverId(null);
                }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                className={`hover:bg-gray-50 cursor-grab active:cursor-grabbing ${!p.active ? "opacity-50" : ""} ${overId === p.id ? "bg-blue-50" : ""} ${dragId === p.id ? "opacity-40" : ""}`}
              >
                <td className="px-1 py-1">
                  <div className="flex flex-col items-center">
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
                </td>
                <td className="px-2 py-1.5 font-mono text-xs text-gray-500">{p.code}</td>
                <td className="px-2 py-1.5">
                  <Link href={`/products/${p.id}`} className="text-blue-600 hover:underline font-medium">
                    {p.name}
                  </Link>
                  {p.size && <span className="text-[10px] text-gray-400 ml-1">{p.size}</span>}
                  {!p.active && <Badge variant="outline" className="ml-2 text-[10px]">取扱終了</Badge>}
                </td>
                <td className="px-2 py-1.5 text-right font-medium">
                  {p.wholesalePrice ? p.wholesalePrice.toLocaleString() : "-"}
                </td>
                <td className="px-2 py-1.5 text-right bg-emerald-50/40">
                  {p.purchaseCost ? p.purchaseCost.toLocaleString() : "-"}
                </td>
                <td className="px-1 py-1.5 text-right text-gray-600 text-xs bg-blue-50/20 border-l">
                  {p.production.口金 ? p.production.口金.toLocaleString() : "-"}
                </td>
                <td className="px-1 py-1.5 text-right text-gray-600 text-xs bg-blue-50/20">
                  {p.production.貼り ? p.production.貼り.toLocaleString() : "-"}
                </td>
                <td className="px-1 py-1.5 text-right text-gray-600 text-xs bg-blue-50/20">
                  {p.production.縫製 ? p.production.縫製.toLocaleString() : "-"}
                </td>
                <td className="px-1 py-1.5 text-right text-gray-600 text-xs bg-blue-50/20">
                  {p.production.その他 ? p.production.その他.toLocaleString() : "-"}
                </td>
                <td className="px-2 py-1.5 text-right text-gray-600">
                  {p.workerCost ? p.workerCost.toLocaleString() : "-"}
                </td>
                <td className="px-1 py-1.5 text-right text-gray-500 text-xs bg-slate-50/40 border-l">
                  {p.salesCost ? p.salesCost.toLocaleString() : "-"}
                </td>
                <td className="px-1 py-1.5 text-right text-gray-500 text-xs bg-slate-50/40">
                  {p.outboundCost ? p.outboundCost.toLocaleString() : "-"}
                </td>
                <td className="px-1 py-1.5 text-right text-gray-500 text-xs bg-slate-50/40">
                  {p.mgmtCost ? p.mgmtCost.toLocaleString() : "-"}
                </td>
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
