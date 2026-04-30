"use client";

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
import { Search, AlertTriangle, Boxes, Pencil } from "lucide-react";

interface InventoryRow {
  id: string;
  code: string;
  name: string;
  series: string | null;
  size: string | null;
  wholesalePrice: number | null;
  workerCost: number | null;
  stock: number;
  backlog: number;
}

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [showShortageOnly, setShowShortageOnly] = useState(false);
  const [editTarget, setEditTarget] = useState<InventoryRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/inventory");
    setRows(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdjust(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editTarget) return;
    const form = new FormData(e.currentTarget);
    const mode = form.get("mode") as string;
    const value = Number(form.get("value"));
    await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: editTarget.id,
        ...(mode === "set" ? { stock: value } : { delta: value }),
        note: form.get("note") || null,
      }),
    });
    setEditTarget(null);
    load();
  }

  const filtered = rows.filter((r) => {
    if (seriesFilter && r.series !== seriesFilter) return false;
    if (showShortageOnly && r.stock >= r.backlog) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
    }
    return true;
  });

  // サマリー
  const totalStock = rows.reduce((s, r) => s + r.stock, 0);
  const totalBacklog = rows.reduce((s, r) => s + r.backlog, 0);
  const shortageCount = rows.filter((r) => r.stock < r.backlog).length;
  const stockValue = rows.reduce((s, r) => s + r.stock * (r.wholesalePrice || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">在庫</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showShortageOnly}
              onChange={(e) => setShowShortageOnly(e.target.checked)}
            />
            不足のみ
          </label>
        </div>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white shadow-sm border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">総在庫数</p>
            <p className="text-2xl font-bold">{totalStock.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">{rows.length}商品</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">在庫評価額</p>
            <p className="text-2xl font-bold">{stockValue.toLocaleString()}<span className="text-sm font-normal text-gray-500">円</span></p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-sm border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">受注残合計</p>
            <p className="text-2xl font-bold">{totalBacklog.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className={`bg-white shadow-sm border-l-4 ${shortageCount > 0 ? "border-l-red-500" : "border-l-green-500"}`}>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">不足商品</p>
            <p className={`text-2xl font-bold ${shortageCount > 0 ? "text-red-600" : "text-green-600"}`}>
              {shortageCount}
            </p>
            <p className="text-xs text-gray-400 mt-1">在庫 &lt; 受注残</p>
          </CardContent>
        </Card>
      </div>

      {filtered.length === 0 ? (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-12 text-center text-gray-400">
            <Boxes className="size-12 mx-auto mb-3 text-gray-300" />
            <p>該当データがありません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">商品</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">シリーズ</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">在庫</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">受注残</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">差分</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">在庫評価</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => {
                const diff = r.stock - r.backlog;
                const shortage = diff < 0;
                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${shortage ? "bg-red-50/50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-gray-500">{r.code}</div>
                      <div className="font-medium">{r.name}</div>
                      {r.size && <div className="text-xs text-gray-400">{r.size}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {r.series && (
                        <Badge className={`text-xs ${getSeriesColor(r.series)}`}>
                          {getSeriesLabel(r.series)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{r.stock.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-orange-600">{r.backlog.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-bold ${shortage ? "text-red-600" : "text-green-600"}`}>
                      {shortage && <AlertTriangle className="inline size-3 mr-1" />}
                      {diff > 0 ? "+" : ""}{diff.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {r.wholesalePrice ? `${(r.stock * r.wholesalePrice).toLocaleString()}円` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditTarget(r)}
                        className="text-gray-400 hover:text-gray-700 p-1"
                        title="在庫調整"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 在庫調整ダイアログ */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>在庫を調整</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <form onSubmit={handleAdjust} className="space-y-3">
              <div className="bg-gray-50 rounded p-3">
                <p className="font-mono text-xs text-gray-500">{editTarget.code}</p>
                <p className="font-medium">{editTarget.name}</p>
                <p className="text-sm text-gray-600 mt-1">現在の在庫: <span className="font-bold">{editTarget.stock}</span></p>
              </div>
              <div>
                <label className="text-xs text-gray-500">調整方法</label>
                <select name="mode" defaultValue="delta" className="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="delta">増減で指定</option>
                  <option value="set">在庫数を直接設定</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">数量</label>
                <Input name="value" type="number" required placeholder="例: +50 / 100" />
                <p className="text-xs text-gray-400 mt-1">増減の場合: +50 で50個追加、-10 で10個減</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">理由・備考</label>
                <textarea name="note" rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-y" />
              </div>
              <Button type="submit" className="w-full">調整</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
