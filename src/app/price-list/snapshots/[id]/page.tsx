"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, Printer, Pencil, Save, X } from "lucide-react";
import { getAllMatrixRows } from "@/lib/contact-meta";

interface SnapshotItem {
  id: string;
  productId: string;
  productCode: string | null;
  productName: string;
  series: string | null;
  cost: number;
  retailPrice: number | null;
  prices: Record<string, number>;
}

interface Snapshot {
  id: string;
  name: string;
  note: string | null;
  snappedAt: string;
  items: SnapshotItem[];
}

export default function SnapshotDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [editMeta, setEditMeta] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNote, setEditNote] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");

  const matrixRows = getAllMatrixRows();

  const load = useCallback(async () => {
    const res = await fetch(`/api/price-list/snapshots/${id}`);
    const data = await res.json();
    setSnap(data);
    setEditName(data.name);
    setEditNote(data.note || "");
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveMeta() {
    await fetch(`/api/price-list/snapshots/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, note: editNote }),
    });
    setEditMeta(false);
    load();
  }

  if (!snap) return <div className="p-6 text-gray-400">読み込み中...</div>;

  const seriesOptions = Array.from(new Set(snap.items.map((i) => i.series).filter((s): s is string => !!s))).sort();
  const visibleItems = seriesFilter
    ? snap.items.filter((i) => i.series === seriesFilter)
    : snap.items;

  function exportCSV() {
    if (!snap) return;
    const header = ["コード", "商品名", "シリーズ", "原価", "上代", ...matrixRows.map((r) => `${r.typeLabel} ${r.ratePct}%`)];
    const rows = visibleItems.map((it) => [
      it.productCode || "",
      it.productName,
      it.series || "",
      String(it.cost),
      String(it.retailPrice ?? 0),
      ...matrixRows.map((r) => String(it.prices[`${r.typeId}_${r.ratePct}`] ?? 0)),
    ]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${snap.name}_${new Date(snap.snappedAt).toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/price-list" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="size-4" /> 価格表へ戻る
        </Link>
      </div>

      <Card className="bg-white shadow-sm">
        <CardContent className="py-4">
          {editMeta ? (
            <div className="space-y-3">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="text-xl font-bold" />
              <textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                rows={2}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="メモ"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveMeta}>
                  <Save className="size-4 mr-1" /> 保存
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditMeta(false)}>
                  <X className="size-4 mr-1" /> 取消
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{snap.name}</h2>
                {snap.note && <p className="text-sm text-gray-600 mt-1">{snap.note}</p>}
                <p className="text-xs text-gray-400 mt-2">
                  保存日時: {new Date(snap.snappedAt).toLocaleString("ja-JP")} / {snap.items.length}商品
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditMeta(true)}>
                <Pencil className="size-4 mr-1" /> 編集
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 flex-wrap print:hidden">
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
      </div>

      <Card className="bg-white shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-2 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[180px]">商品</th>
                <th className="text-right px-2 py-2 font-medium text-gray-500 w-20">原価</th>
                <th className="text-right px-2 py-2 font-medium text-gray-500 w-20 bg-amber-50">上代</th>
                {matrixRows.map((r) => (
                  <th key={`${r.typeId}_${r.ratePct}`} className="text-right px-2 py-2 font-medium text-gray-500 min-w-[80px]">
                    <div className={`inline-block px-1 rounded ${r.color}`}>{r.typeLabel}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{r.ratePct}%</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleItems.map((it) => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="px-2 py-1.5 sticky left-0 bg-white">
                    <Link href={`/products/${it.productId}`} className="text-blue-600 hover:underline font-medium">
                      {it.productName}
                    </Link>
                    <div className="text-[10px] font-mono text-gray-400">{it.productCode || "-"}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-600">{it.cost.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right font-medium bg-amber-50/30">{(it.retailPrice ?? 0).toLocaleString()}</td>
                  {matrixRows.map((r) => {
                    const price = it.prices[`${r.typeId}_${r.ratePct}`] ?? 0;
                    return (
                      <td key={`${r.typeId}_${r.ratePct}`} className="px-2 py-1.5 text-right font-medium">
                        {price > 0 ? price.toLocaleString() : "-"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
