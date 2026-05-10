"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRODUCT_SERIES, getSeriesLabel, getSeriesColor } from "@/lib/product-meta";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

interface MonthData {
  month: string;
  confirmed: number;
  forecast: number;
}

interface ProductRow {
  id: string;
  code: string;
  name: string;
  series: string | null;
  months: MonthData[];
}

interface ApiResponse {
  months: string[];
  products: ProductRow[];
}

function getDefaultRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const next6 = new Date(now.getFullYear(), now.getMonth() + 5, 1);
  const to = `${next6.getFullYear()}-${String(next6.getMonth() + 1).padStart(2, "0")}`;
  return { from, to };
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ymLabel(ym: string) {
  const [, m] = ym.split("-").map(Number);
  return `${m}月`;
}

export default function ForecastPage() {
  const [range, setRange] = useState(getDefaultRange());
  const [data, setData] = useState<ApiResponse | null>(null);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [hideZero, setHideZero] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ from: range.from, to: range.to });
    const res = await fetch(`/api/forecasts?${params.toString()}`);
    setData(await res.json());
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveForecast(productId: string, month: string, forecast: number) {
    await fetch("/api/forecasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, month, forecast, source: "manual" }),
    });
    // ローカル状態を更新
    if (data) {
      setData({
        ...data,
        products: data.products.map((p) =>
          p.id !== productId
            ? p
            : {
                ...p,
                months: p.months.map((m) => (m.month !== month ? m : { ...m, forecast })),
              }
        ),
      });
    }
  }

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    let list = data.products;
    if (seriesFilter) list = list.filter((p) => p.series === seriesFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    }
    if (hideZero) {
      list = list.filter((p) => p.months.some((m) => m.confirmed > 0 || m.forecast > 0));
    }
    return list;
  }, [data, search, seriesFilter, hideZero]);

  // 月別合計（フィルタ後の商品の合計）
  const monthlyTotals = useMemo(() => {
    if (!data) return [];
    return data.months.map((month, idx) => {
      const confirmed = filteredProducts.reduce((s, p) => s + p.months[idx].confirmed, 0);
      const forecast = filteredProducts.reduce((s, p) => s + p.months[idx].forecast, 0);
      return { month, confirmed, forecast };
    });
  }, [data, filteredProducts]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">需要予測</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
            <Input
              placeholder="商品名・コード"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-48"
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
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
            データありのみ
          </label>
        </div>
      </div>

      {/* 期間選択 */}
      <Card className="bg-white shadow-sm">
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500">期間:</span>
          <button
            onClick={() => setRange({ from: shiftMonth(range.from, -1), to: shiftMonth(range.to, -1) })}
            className="p-1 rounded border hover:bg-gray-50"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-medium">
            {range.from.replace("-", "年")}月 〜 {range.to.replace("-", "年")}月
          </span>
          <button
            onClick={() => setRange({ from: shiftMonth(range.from, 1), to: shiftMonth(range.to, 1) })}
            className="p-1 rounded border hover:bg-gray-50"
          >
            <ChevronRight className="size-4" />
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRange(getDefaultRange())}
            className="ml-2"
          >
            今月から6ヶ月
          </Button>
          <span className="text-xs text-gray-400 ml-auto">
            予測（青枠）をクリックして編集
          </span>
        </CardContent>
      </Card>

      {/* メイングリッド */}
      <Card className="bg-white shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[200px]">
                  商品
                </th>
                {data?.months.map((m) => (
                  <th key={m} className="px-2 py-2 font-medium text-gray-500 text-center min-w-[120px] border-l">
                    <div className="font-bold">{ymLabel(m)}</div>
                    <div className="text-[10px] text-gray-400 grid grid-cols-3 gap-1 mt-1">
                      <span>確定</span>
                      <span className="text-blue-500">予測</span>
                      <span>合計</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2 sticky left-0 bg-white">
                    <div className="font-mono text-xs text-gray-500">{p.code}</div>
                    <div className="font-medium">{p.name}</div>
                    {p.series && (
                      <Badge className={`text-[10px] mt-1 ${getSeriesColor(p.series)}`}>
                        {getSeriesLabel(p.series)}
                      </Badge>
                    )}
                  </td>
                  {p.months.map((m) => {
                    const total = m.confirmed + m.forecast;
                    return (
                      <td key={m.month} className="px-2 py-1 text-center border-l">
                        <div className="grid grid-cols-3 gap-1 items-center">
                          <span className="text-xs text-gray-600">{m.confirmed || "-"}</span>
                          <ForecastCell
                            value={m.forecast}
                            onSave={(v) => saveForecast(p.id, m.month, v)}
                          />
                          <span className={`text-xs font-medium ${total > 0 ? "text-gray-900" : "text-gray-300"}`}>
                            {total || "-"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={(data?.months.length || 0) + 1} className="text-center text-gray-400 py-8">
                    該当データなし
                  </td>
                </tr>
              )}
            </tbody>
            {filteredProducts.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 sticky bottom-0">
                <tr>
                  <td className="px-4 py-3 font-bold sticky left-0 bg-gray-50">合計</td>
                  {monthlyTotals.map((t) => (
                    <td key={t.month} className="px-2 py-3 text-center border-l">
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-xs font-medium">{t.confirmed.toLocaleString()}</span>
                        <span className="text-xs font-medium text-blue-600">{t.forecast.toLocaleString()}</span>
                        <span className="text-xs font-bold">{(t.confirmed + t.forecast).toLocaleString()}</span>
                      </div>
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ForecastCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  function commit() {
    const n = Number(draft);
    if (!isNaN(n) && n !== value) {
      onSave(n);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setEditing(false);
        }}
        className="w-full text-xs text-center border border-blue-500 rounded px-1 py-0.5"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className={`w-full text-xs text-center px-1 py-0.5 rounded border ${
        value > 0
          ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
          : "border-dashed border-gray-200 text-gray-300 hover:bg-blue-50 hover:border-blue-200"
      }`}
    >
      {value > 0 ? value : "+"}
    </button>
  );
}
