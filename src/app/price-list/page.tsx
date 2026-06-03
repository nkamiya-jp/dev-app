"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
import { Camera, Archive, Download, Printer } from "lucide-react";

interface MatrixRow {
  typeId: string;
  typeLabel: string;
  ratePct: number;
  kind: string;
  color: string;
}

interface PriceItem {
  productId: string;
  code: string | null;
  name: string;
  series: string | null;
  size: string | null;
  cost: number;
  retailPrice: number;
  wholesalePrice: number | null;
  prices: Record<string, { ratePct: number; price: number; profit: number; profitRate: number }>;
}

interface PriceListResponse {
  matrixRows: MatrixRow[];
  items: PriceItem[];
  generatedAt: string;
}

interface Snapshot {
  id: string;
  name: string;
  note: string | null;
  snappedAt: string;
  _count: { items: number };
}

export default function PriceListPage() {
  const [data, setData] = useState<PriceListResponse | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [seriesFilter, setSeriesFilter] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveNote, setSaveNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [pl, s] = await Promise.all([
      fetch("/api/price-list").then((r) => r.json()),
      fetch("/api/price-list/snapshots").then((r) => r.json()),
    ]);
    setData(pl);
    setSnaps(Array.isArray(s) ? s : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSnapshot() {
    if (!saveName.trim()) {
      alert("名前を入力してください");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/price-list/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), note: saveNote || null }),
      });
      if (res.ok) {
        setSaveOpen(false);
        setSaveName("");
        setSaveNote("");
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <div className="p-6 text-gray-400">読み込み中...</div>;

  // シリーズで絞り込み
  const seriesOptions = Array.from(new Set(data.items.map((i) => i.series).filter((s): s is string => !!s))).sort();
  const visibleItems = seriesFilter
    ? data.items.filter((i) => i.series === seriesFilter)
    : data.items;

  // 顧客タイプで絞り込み
  const visibleRows = selectedTypes.size === 0
    ? data.matrixRows
    : data.matrixRows.filter((r) => selectedTypes.has(`${r.typeId}_${r.ratePct}`));

  function toggleType(key: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // CSV エクスポート
  function exportCSV() {
    const header = ["コード", "商品名", "シリーズ", "原価", "上代", ...visibleRows.map((r) => `${r.typeLabel} ${r.ratePct}%`)];
    const rows = visibleItems.map((it) => [
      it.code || "",
      it.name,
      it.series || "",
      String(it.cost),
      String(it.retailPrice),
      ...visibleRows.map((r) => String(it.prices[`${r.typeId}_${r.ratePct}`]?.price ?? 0)),
    ]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `価格表_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-2xl font-bold">価格表</h2>
          <p className="text-xs text-gray-500 mt-1">商品 × 顧客タイプ別の販売価格マトリクス</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={seriesFilter}
            onChange={(e) => setSeriesFilter(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="">全シリーズ</option>
            {seriesOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="size-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4 mr-1" /> 印刷
          </Button>
          <Button size="sm" onClick={() => {
            setSaveName(`価格表 ${new Date().toLocaleDateString("ja-JP")}`);
            setSaveOpen(true);
          }}>
            <Camera className="size-4 mr-1" /> 現在の価格を保存
          </Button>
        </div>
      </div>

      {/* 顧客タイプ絞り込み */}
      <div className="bg-white border rounded-md p-3 print:hidden">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">表示する顧客タイプ:</span>
          {data.matrixRows.map((r) => {
            const key = `${r.typeId}_${r.ratePct}`;
            const active = selectedTypes.size === 0 || selectedTypes.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleType(key)}
                className={`text-xs px-2 py-1 rounded ${active ? r.color : "bg-gray-50 text-gray-400 line-through"}`}
              >
                {r.typeLabel} {r.ratePct}%
              </button>
            );
          })}
          {selectedTypes.size > 0 && (
            <button onClick={() => setSelectedTypes(new Set())} className="text-xs text-blue-600 hover:underline">
              全タイプ表示
            </button>
          )}
        </div>
      </div>

      {/* 価格マトリクス */}
      <Card className="bg-white shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="text-left px-2 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[180px]">商品</th>
                <th className="text-right px-2 py-2 font-medium text-gray-500 w-20">原価</th>
                <th className="text-right px-2 py-2 font-medium text-gray-500 w-20 bg-amber-50">上代</th>
                {visibleRows.map((r) => (
                  <th key={`${r.typeId}_${r.ratePct}`} className="text-right px-2 py-2 font-medium text-gray-500 min-w-[80px]">
                    <div className={`inline-block px-1 rounded ${r.color}`}>{r.typeLabel}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{r.ratePct}%</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={visibleRows.length + 3} className="text-center text-gray-400 py-8">
                    商品がありません
                  </td>
                </tr>
              ) : (
                visibleItems.map((it) => (
                  <tr key={it.productId} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5 sticky left-0 bg-white z-10">
                      <Link href={`/products/${it.productId}`} className="text-blue-600 hover:underline font-medium">
                        {it.name}
                      </Link>
                      <div className="text-[10px] font-mono text-gray-400">{it.code || "-"}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-600">{it.cost.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right font-medium bg-amber-50/30">{it.retailPrice.toLocaleString() || "-"}</td>
                    {visibleRows.map((r) => {
                      const cell = it.prices[`${r.typeId}_${r.ratePct}`];
                      const price = cell?.price ?? 0;
                      const profit = cell?.profit ?? 0;
                      return (
                        <td key={`${r.typeId}_${r.ratePct}`} className="px-2 py-1.5 text-right">
                          <div className="font-medium">{price > 0 ? price.toLocaleString() : "-"}</div>
                          {price > 0 && (
                            <div className={`text-[10px] ${profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {profit >= 0 ? "+" : ""}{profit.toLocaleString()}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400 print:hidden">
        全 {visibleItems.length} 商品 / 生成: {new Date(data.generatedAt).toLocaleString("ja-JP")}
      </p>

      {/* スナップショット一覧 */}
      <Card className="bg-white shadow-sm print:hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Archive className="size-5" />
            アーカイブ（過去の価格表）
          </CardTitle>
          <span className="text-sm text-gray-500">{snaps.length}件</span>
        </CardHeader>
        <CardContent className="p-0">
          {snaps.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              アーカイブはまだありません
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">名前</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">メモ</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-20">商品数</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-40">保存日時</th>
                  <th className="px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {snaps.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{s.note || "-"}</td>
                    <td className="px-3 py-2 text-right">{s._count.items}</td>
                    <td className="px-3 py-2 text-right text-gray-500 text-xs">
                      {new Date(s.snappedAt).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/price-list/snapshots/${s.id}`} className="text-blue-600 hover:underline text-xs">
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* 保存ダイアログ */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>現在の価格を保存</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">名前 *</label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="例: 2026年5月価格改定"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">メモ（理由など）</label>
              <textarea
                value={saveNote}
                onChange={(e) => setSaveNote(e.target.value)}
                placeholder="例: 米イラン情勢による生地価格高騰のため改定"
                rows={3}
                className="w-full border rounded-md px-3 py-2 text-sm resize-y"
              />
            </div>
            <p className="text-xs text-gray-400">
              現在表示中の全{data.items.length}商品の上代・原価・各顧客タイプ別の卸価格を保存します。
            </p>
            <Button onClick={saveSnapshot} disabled={saving} className="w-full">
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
