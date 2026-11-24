"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, Printer, Pencil, Save, X } from "lucide-react";
import { getAllMatrixRows } from "@/lib/contact-meta";
import { formatSellPrice } from "@/lib/pricing";

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
  contactId?: string | null;
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
  const printedRef = useRef(false);
  // 顧客別：同じ顧客の他の価格表と並べる（改定前→改定後）
  const [others, setOthers] = useState<{ id: string; name: string; snappedAt: string }[]>([]);
  const [compareId, setCompareId] = useState<string>("");
  const [compareLoaded, setCompare] = useState<Snapshot | null>(null);

  const matrixRows = getAllMatrixRows();

  const load = useCallback(async () => {
    const res = await fetch(`/api/price-list/snapshots/${id}`);
    const data = await res.json();
    setSnap(data);
    setEditName(data.name);
    setEditNote(data.note || "");
    if (data.kind === "customer" && data.contactId) {
      const r = await fetch(`/api/price-list/snapshots?contactId=${data.contactId}`);
      if (r.ok) {
        const list = (await r.json()) as { id: string; name: string; snappedAt: string }[];
        const rest = list.filter((x) => x.id !== data.id);
        setOthers(rest);
        // 既定は「これより前で一番新しい控え」（改定後なら改定前と並ぶ）
        const prev = rest.find((x) => new Date(x.snappedAt) < new Date(data.snappedAt));
        setCompareId(prev?.id ?? "");
      }
    }
  }, [id]);

  useEffect(() => {
    if (!compareId) return;
    fetch(`/api/price-list/snapshots/${compareId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCompare(d));
  }, [compareId]);
  const compare = compareId && compareLoaded?.id === compareId ? compareLoaded : null;

  // ?print=1 で開いたら、読み込み後に印刷（PDFに保存）を出す
  useEffect(() => {
    if (printedRef.current || !snap) return;
    if (new URLSearchParams(window.location.search).get("print") !== "1") return;
    if (compareId && !compare) return; // 比較の読み込みを待つ
    printedRef.current = true;
    setTimeout(() => window.print(), 300);
  }, [snap, compareId, compare]);

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
  const sortedItems = snap.items.some((i) => i.prices.order != null)
    ? [...snap.items].sort((a, b) => (a.prices.order ?? 9999) - (b.prices.order ?? 9999))
    : snap.items;
  const visibleItems = seriesFilter
    ? sortedItems.filter((i) => i.series === seriesFilter)
    : sortedItems;
  const compareMap = new Map((compare?.items ?? []).map((i) => [i.productId, i]));
  const showCompare = snap.kind === "customer" && compare != null;

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
        {snap.kind === "customer" && snap.contactId ? (
          <Link href={`/contacts/${snap.contactId}`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <ArrowLeft className="size-4" /> 顧客ページへ戻る
          </Link>
        ) : (
          <Link href="/price-list" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <ArrowLeft className="size-4" /> 価格表へ戻る
          </Link>
        )}
      </div>

      <Card className="bg-white shadow-sm print:hidden">
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
        {snap.kind === "customer" && (
          <label className="text-sm text-gray-600 flex items-center gap-1">
            並べる:
            <select
              value={compareId}
              onChange={(e) => setCompareId(e.target.value)}
              className="border rounded-md px-2 py-2 text-sm max-w-[280px]"
            >
              <option value="">（並べない）</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {new Date(o.snappedAt).toLocaleDateString("ja-JP")} {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-4 mr-1" /> {snap.kind === "customer" ? "PDF・印刷" : "印刷"}
        </Button>
        {snap.kind === "customer" && (
          <span className="text-xs text-gray-400">印刷の画面で「PDFに保存」を選ぶとPDFになります。印刷には原価・粗利・メモ・実数値は出ません</span>
        )}
      </div>

      <Card className="bg-white shadow-sm">
        {/* 印刷用ヘッダ（顧客別） */}
        {snap.kind === "customer" && (
          <div className="hidden print:block px-4 pt-4 pb-2">
            <div className="flex items-end justify-between">
              <h1 className="text-xl font-bold">{snap.contactName} 御中</h1>
              <p className="text-xs text-gray-600">{new Date(snap.snappedAt).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
            <h2 className="text-lg font-bold text-center mt-3">{showCompare ? "価格改定のご案内" : "卸価格表"}</h2>
            <div className="flex items-end justify-between mt-2">
              <p className="text-xs text-gray-600">価格はすべて税抜です。</p>
              <p className="text-sm font-medium">株式会社神谷商会</p>
            </div>
          </div>
        )}
        <CardContent className="p-0 overflow-x-auto">
          {snap.kind === "customer" ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 min-w-[200px]">商品</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24 print:hidden">原価</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24 bg-amber-50 print:bg-transparent">上代</th>
                  {showCompare && (
                    <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">
                      {compare && new Date(compare.snappedAt) < new Date(snap.snappedAt) ? "現行価格" : "比較先"}
                      <div className="text-[10px] font-normal print:hidden">{compare && new Date(compare.snappedAt).toLocaleDateString("ja-JP")}</div>
                    </th>
                  )}
                  <th className="text-right px-3 py-2 font-medium text-gray-700 w-28 bg-green-50 print:bg-transparent">
                    {showCompare && compare && new Date(compare.snappedAt) < new Date(snap.snappedAt) ? "新価格" : "卸価格"}
                  </th>
                  {showCompare && <th className="text-right px-3 py-2 font-medium text-gray-500 w-24 print:hidden">差</th>}
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24 print:hidden">粗利</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500 w-24 print:hidden">原価率(卸)</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 min-w-[140px] print:hidden">メモ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleItems.map((it) => {
                  const wholesale = it.prices.wholesale ?? 0;
                  const profit = wholesale - it.cost;
                  const crWholesale = wholesale > 0 ? (it.cost / wholesale) * 100 : 0;
                  const autoRaw = it.prices.autoRaw;
                  const showRaw = !it.prices.override && autoRaw != null && wholesale === it.prices.auto;
                  const prev = compareMap.get(it.productId);
                  const prevPrice = prev ? prev.prices.wholesale ?? 0 : null;
                  const diff = prevPrice != null && prevPrice > 0 ? wholesale - prevPrice : null;
                  return (
                    <tr key={it.id} className="hover:bg-gray-50 break-inside-avoid">
                      <td className="px-3 py-2">
                        <Link href={`/products/${it.productId}`} className="text-blue-600 hover:underline font-medium print:text-black">
                          {it.productName}
                        </Link>
                        <div className="text-[10px] font-mono text-gray-400">{it.productCode || "-"}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 print:hidden">{it.cost.toLocaleString()}円</td>
                      <td className="px-3 py-2 text-right bg-amber-50/30 print:bg-transparent">{(it.retailPrice ?? 0) > 0 ? `${(it.retailPrice ?? 0).toLocaleString()}円` : "-"}</td>
                      {showCompare && (
                        <td className="px-3 py-2 text-right text-gray-600">
                          {prevPrice != null && prevPrice > 0 ? `${prevPrice.toLocaleString()}円` : "-"}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right font-bold bg-green-50/40 print:bg-transparent whitespace-nowrap">
                        {wholesale > 0 ? (
                          <>
                            <span className="print:hidden">{showRaw ? formatSellPrice(wholesale, autoRaw, "円") : `${wholesale.toLocaleString()}円`}</span>
                            <span className="hidden print:inline">{wholesale.toLocaleString()}円</span>
                          </>
                        ) : "-"}
                        {it.prices.override ? <span className="text-[10px] text-blue-500 ml-1 print:hidden">個別</span> : null}
                      </td>
                      {showCompare && (
                        <td className={`px-3 py-2 text-right text-xs print:hidden ${diff == null || diff === 0 ? "text-gray-300" : diff > 0 ? "text-red-600" : "text-blue-600"}`}>
                          {diff == null ? "-" : diff === 0 ? "±0" : `${diff > 0 ? "+" : ""}${diff.toLocaleString()}円（${diff > 0 ? "+" : ""}${((diff / (prevPrice || 1)) * 100).toFixed(1)}%）`}
                        </td>
                      )}
                      <td className={`px-3 py-2 text-right font-medium print:hidden ${profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {wholesale > 0 ? `${profit >= 0 ? "+" : ""}${profit.toLocaleString()}円` : "-"}
                      </td>
                      <td className={`px-3 py-2 text-right print:hidden ${crWholesale > 80 ? "text-red-500 font-medium" : "text-gray-500"}`}>
                        {wholesale > 0 ? `${crWholesale.toFixed(0)}%` : "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs print:hidden">{it.note || "-"}</td>
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
