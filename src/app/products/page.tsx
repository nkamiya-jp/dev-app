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
import { Search, Pencil, Plus, Package } from "lucide-react";

interface Product {
  id: string;
  code: string;
  name: string;
  series: string | null;
  size: string | null;
  wholesalePrice: number | null;
  workerCost: number | null;
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
          />
        ))}
        {noSeries.length > 0 && (
          <ProductGroup
            title="未分類"
            color="bg-gray-100 text-gray-700"
            items={noSeries}
            onEdit={setEditTarget}
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
}: {
  title: string;
  color: string;
  items: Product[];
  onEdit: (p: Product) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Badge className={color}>{title}</Badge>
        <span className="text-sm text-gray-500">{items.length}件</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((p) => (
          <Card key={p.id} className={`bg-white shadow-sm hover:shadow-md transition-shadow ${!p.active ? "opacity-50" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <Link href={`/products/${p.id}`} className="flex-1 min-w-0 group hover:underline">
                  <p className="text-xs text-gray-500 font-mono">{p.code}</p>
                  <p className="font-medium truncate">{p.name}</p>
                  {p.size && <p className="text-xs text-gray-400 mt-0.5">{p.size}</p>}
                </Link>
                <button
                  onClick={() => onEdit(p)}
                  className="text-gray-400 hover:text-gray-700 p-1 -m-1"
                  title="編集"
                >
                  <Pencil className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
                <div>
                  <span className="text-gray-500">卸: </span>
                  <span className="font-medium">{p.wholesalePrice ? `${p.wholesalePrice.toLocaleString()}円` : "-"}</span>
                </div>
                <div>
                  <span className="text-gray-500">内職: </span>
                  <span className="font-medium">{p.workerCost ? `${p.workerCost.toLocaleString()}円` : "-"}</span>
                </div>
              </div>
              {p.inventory && (
                <div className="mt-2 pt-2 border-t text-xs">
                  <span className="text-gray-500">在庫: </span>
                  <span className="font-medium">{p.inventory.stock}</span>
                </div>
              )}
              {!p.active && (
                <Badge variant="outline" className="mt-2 text-xs">取扱終了</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
