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
  note?: string | null;
}

interface Snapshot {
  id: string;
  name: string;
  note: string | null;
  kind?: string;              // "matrix" | "customer"
  contactName?: string | null;
  contactRate?: number | null;
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
    let header: string[];
    let rows: string[][];
    if (snap.kind === "customer") {
      header = ["コード", "商品名", "原価", "上代", "卸価格", "個別/自動", "原価率(卸)", "メモ"];
      rows = visibleItems.map((it) => {
        const wholesale = it.prices.wholesale ?? 0;
        const crWholesale = wholesale > 0 ? (it.cost / wholesale) * 100 : 0;
        return [
          it.productCode || "",
          it.productName,
          String(it.cost),
          String(it.retailPrice ?? 0),
          String(wholesale),
          it.prices.override ? "個別" : "自動",
          `${crWholesale.toFixed(1)}%`,
          it.note || "",
        ];
      });
    } else {
      header = ["コード", "商品名", "シリーズ", "原価", "上代", ...matrixRows.map((r) => `${r.typeLabel} ${r.ratePct}%`)];
      rows = visibleItems.map((it) => [
        it.productCode || "",
        it.productName,
        it.series || "",
        String(it.cost),
        String(it.retailPrice ?? 0),
        ...matrixRows.map((r) => String(it.prices[`${r.typeId}_${r.ratePct}`] ?? 0)),
      ]);
    }
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
                {snap.kind === "customer" && (
                  <p className="text-sm text-blue-700 mt-1">
                    顧客別アーカイブ: <strong>{snap.contactName || "-"}</strong>
                    {snap.contactRate != null && <span className="text-gray-500 ml-2">掛率 {snap.contactRate}%</span>}
                  </p>
                )}
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
        {/* 印刷用ヘッダ（顧客別） */}
        {snap.kind === "customer" && (
          <div className="hidden print:block px-4 pt-4">
            <h1 className="text-lg font-bold">{snap.contactName} 御中 価格表</h1>
            <p className="text-xs text-gray-500">{new Date(snap.snappedAt).toLocaleDateString("ja-JP")} 時点</p>
          </div>
        )}
        <CardContent className="p-0 overflow-x-auto">
          {snap.kind === "customer" ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 min-w-[200px]">商品</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">原価</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24 bg-amber-50">上代</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-700 w-28 bg-green-50">卸価格</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">粗利</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">原価率(卸)</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 min-w-[140px]">メモ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleItems.map((it) => {
                  const wholesale = it.prices.wholesale ?? 0;
                  const profit = wholesale - it.cost;
                  const crWholesale = wholesale > 0 ? (it.cost / wholesale) * 100 : 0;
                  return (
                    <tr key={it.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Link href={`/products/${it.productId}`} className="text-blue-600 hover:underline font-medium">
                          {it.productName}
                        </Link>
                        <div className="text-[10px] font-mono text-gray-400">{it.productCode || "-"}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{it.cost.toLocaleString()}円</td>
                      <td className="px-3 py-2 text-right bg-amber-50/30">{(it.retailPrice ?? 0) > 0 ? `${(it.retailPrice ?? 0).toLocaleString()}円` : "-"}</td>
                      <td className="px-3 py-2 text-right font-bold bg-green-50/40">
                        {wholesale > 0 ? `${wholesale.toLocaleString()}円` : "-"}
                        {it.prices.override ? <span className="text-[10px] text-blue-500 ml-1 print:hidden">個別</span> : null}
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {wholesale > 0 ? `${profit >= 0 ? "+" : ""}${profit.toLocaleString()}円` : "-"}
                      </td>
                      <td className={`px-3 py-2 text-right ${crWholesale > 80 ? "text-red-500 font-medium" : "text-gray-500"}`}>
                        {wholesale > 0 ? `${crWholesale.toFixed(0)}%` : "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{it.note || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
