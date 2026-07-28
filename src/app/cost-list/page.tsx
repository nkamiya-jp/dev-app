"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer, ChevronDown, ChevronRight, ArrowUpDown } from "lucide-react";

interface Breakdown {
  productionCost: number;
  cuttingCost: number;
  fabricCost: number;
  materialCost: number;
  packagingMaterialCost: number;
  purchaseCost: number;
  laborCost: number;
}

interface Step {
  step: string;
  cost: number;
}

interface Item {
  productId: string;
  code: string | null;
  name: string;
  series: string | null;
  sortOrder: number;
  cost: number;
  breakdown: Breakdown;
  steps: Step[];
  retailPrice: number;
  costRatioVsRetail: number;
}

// 表の列定義。key は並び替えに使う
const COLS = [
  { key: "productionCost", label: "制作費", hint: "縫製など工程", cls: "text-blue-700" },
  { key: "cuttingCost", label: "裁断費", hint: "内製/外注", cls: "text-teal-700" },
  { key: "fabricCost", label: "生地費", hint: "表地/裏地/芯", cls: "text-purple-700" },
  { key: "materialCost", label: "資材費", hint: "口金など", cls: "text-amber-700" },
  { key: "packagingMaterialCost", label: "梱包資材費", hint: "袋・箱", cls: "text-pink-700" },
  { key: "purchaseCost", label: "仕入", hint: "仕入品", cls: "text-emerald-700" },
  { key: "laborCost", label: "販管費", hint: "営業/出荷/管理", cls: "text-gray-600" },
] as const;

type SortKey = (typeof COLS)[number]["key"] | "name" | "cost" | "retailPrice" | "costRatioVsRetail";

export default function CostListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [seriesFilter, setSeriesFilter] = useState("");
  // 制作費の見直しが目的なので、初期は制作費の高い順
  const [sortKey, setSortKey] = useState<SortKey>("productionCost");
  const [sortDesc, setSortDesc] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch("/api/price-list");
    const data = await res.json();
    setItems(Array.isArray(data.items) ? data.items : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const seriesOptions = Array.from(
    new Set(items.map((i) => i.series).filter((s): s is string => !!s))
  ).sort();

  const filtered = seriesFilter ? items.filter((i) => i.series === seriesFilter) : items;

  function valueOf(it: Item, key: SortKey): number | string {
    if (key === "name") return it.name;
    if (key === "cost") return it.cost;
    if (key === "retailPrice") return it.retailPrice;
    if (key === "costRatioVsRetail") return it.costRatioVsRetail;
    return it.breakdown[key];
  }

  const sorted = [...filtered].sort((a, b) => {
    const va = valueOf(a, sortKey);
    const vb = valueOf(b, sortKey);
    if (typeof va === "string" || typeof vb === "string") {
      const r = String(va).localeCompare(String(vb), "ja");
      return sortDesc ? -r : r;
    }
    return sortDesc ? vb - va : va - vb;
  });

  // 列ごとの最大値（高い商品を目立たせる）
  const maxOf: Record<string, number> = {};
  for (const c of COLS) {
    maxOf[c.key] = Math.max(0, ...filtered.map((i) => i.breakdown[c.key]));
  }

  const totals = filtered.reduce(
    (acc, it) => {
      for (const c of COLS) acc[c.key] += it.breakdown[c.key];
      acc.cost += it.cost;
      return acc;
    },
    { productionCost: 0, cuttingCost: 0, fabricCost: 0, materialCost: 0, packagingMaterialCost: 0, purchaseCost: 0, laborCost: 0, cost: 0 } as Record<string, number>
  );
  const n = filtered.length || 1;

  function exportCSV() {
    const header = ["コード", "商品名", "シリーズ", ...COLS.map((c) => c.label), "合計原価", "上代", "原価率(上代)"];
    const rows = sorted.map((it) => [
      it.code || "",
      it.name,
      it.series || "",
      ...COLS.map((c) => String(it.breakdown[c.key])),
      String(it.cost),
      String(it.retailPrice),
      it.retailPrice > 0 ? `${it.costRatioVsRetail.toFixed(1)}%` : "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `原価比較_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function SortHead({ k, children, align = "right" }: { k: SortKey; children: React.ReactNode; align?: "left" | "right" }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        className={`px-2 py-2 font-medium cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap ${align === "left" ? "text-left" : "text-right"} ${active ? "text-gray-900" : "text-gray-500"}`}
      >
        <span className="inline-flex items-center gap-0.5">
          {children}
          {active ? (
            <span className="text-[10px]">{sortDesc ? "▼" : "▲"}</span>
          ) : (
            <ArrowUpDown className="size-3 text-gray-300" />
          )}
        </span>
      </th>
    );
  }

  if (loading) return <div className="p-6 text-gray-400">読み込み中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row print:hidden">
        <div>
          <h2 className="text-2xl font-bold">原価比較</h2>
          <p className="text-xs text-gray-500 mt-1">
            商品ごとの原価内訳を横並びで比較します。列見出しをクリックで並び替え、商品行をクリックで制作費の工程内訳を表示。
          </p>
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
        </div>
      </div>

      <Card className="bg-white shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-6 print:hidden"></th>
                <SortHead k="name" align="left">商品</SortHead>
                {COLS.map((c) => (
                  <SortHead key={c.key} k={c.key}>
                    <span className="flex flex-col items-end">
                      <span className={c.cls}>{c.label}</span>
                      <span className="text-[9px] text-gray-400 font-normal">{c.hint}</span>
                    </span>
                  </SortHead>
                ))}
                <SortHead k="cost">合計原価</SortHead>
                <SortHead k="retailPrice">上代</SortHead>
                <SortHead k="costRatioVsRetail">原価率</SortHead>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length + 5} className="text-center text-gray-400 py-8">
                    商品がありません
                  </td>
                </tr>
              ) : (
                sorted.map((it) => {
                  const isOpen = expanded.has(it.productId);
                  return (
                    <Fragment key={it.productId}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleExpand(it.productId)}
                      >
                        <td className="px-1 print:hidden text-gray-300">
                          {it.steps.length > 0 &&
                            (isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />)}
                        </td>
                        <td className="px-2 py-1.5">
                          <Link
                            href={`/products/${it.productId}`}
                            className="text-blue-600 hover:underline font-medium"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {it.name}
                          </Link>
                          <div className="text-[10px] font-mono text-gray-400">{it.code || "-"}</div>
                        </td>
                        {COLS.map((c) => {
                          const v = it.breakdown[c.key];
                          const isMax = v > 0 && v === maxOf[c.key];
                          return (
                            <td key={c.key} className="px-2 py-1.5 text-right">
                              <span className={isMax ? "font-bold text-red-600" : "text-gray-700"}>
                                {v.toLocaleString()}
                              </span>
                              {/* 相対量を細いバーで示す */}
                              {maxOf[c.key] > 0 && (
                                <div className="h-0.5 bg-gray-100 mt-0.5 rounded-full overflow-hidden">
                                  <div
                                    className={isMax ? "h-full bg-red-400" : "h-full bg-gray-300"}
                                    style={{ width: `${(v / maxOf[c.key]) * 100}%` }}
                                  />
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right font-bold">{it.cost.toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right text-gray-600">
                          {it.retailPrice > 0 ? it.retailPrice.toLocaleString() : "-"}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right ${it.costRatioVsRetail > 40 ? "text-red-600 font-medium" : "text-gray-500"}`}
                        >
                          {it.retailPrice > 0 ? `${it.costRatioVsRetail.toFixed(0)}%` : "-"}
                        </td>
                      </tr>

                      {/* 制作費の工程内訳 */}
                      {isOpen && it.steps.length > 0 && (
                        <tr className="bg-blue-50/30">
                          <td className="print:hidden"></td>
                          <td colSpan={COLS.length + 4} className="px-2 py-2">
                            <p className="text-[10px] text-gray-500 mb-1">制作費の工程内訳</p>
                            <div className="flex flex-wrap gap-1.5">
                              {it.steps.map((s, i) => (
                                <span key={i} className="text-[11px] bg-white border rounded px-2 py-0.5">
                                  {s.step}
                                  <span className="ml-1.5 font-medium text-blue-700">{s.cost.toLocaleString()}円</span>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
            {sorted.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 font-medium">
                <tr>
                  <td className="print:hidden"></td>
                  <td className="px-2 py-2 text-gray-600">合計 / 平均（{filtered.length}商品）</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-2 py-2 text-right">
                      <div>{totals[c.key].toLocaleString()}</div>
                      <div className="text-[10px] text-gray-400 font-normal">
                        平均 {Math.round(totals[c.key] / n).toLocaleString()}
                      </div>
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right">
                    <div>{totals.cost.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-400 font-normal">
                      平均 {Math.round(totals.cost / n).toLocaleString()}
                    </div>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400 print:hidden">
        赤字は各項目の最高値。原価率は上代に対する合計原価の割合（40%超で赤）。
      </p>
    </div>
  );
}
