"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, RefreshCw } from "lucide-react";

interface Row {
  productId: string;
  code: string;
  name: string;
  shortName: string | null;
  series: string | null;
  ordered: number;
  shipped: number;
  requested: number;
  completed: number;
  remaining: number;
  rate: number;
  achieved: boolean;
}
interface Totals { ordered: number; requested: number; completed: number; remaining: number; }

// 受注数に対して製造（完成）数が達成しているかを商品ごとに一覧表示。
export function ProductionAchievement({ reloadKey }: { reloadKey?: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [open, setOpen] = useState(true);
  const [onlyShort, setOnlyShort] = useState(false); // 不足があるものだけ

  const load = useCallback(async () => {
    const res = await fetch("/api/productions/summary");
    const json = await res.json();
    setRows(json.rows);
    setTotals(json.totals);
  }, []);

  useEffect(() => { load(); }, [load, reloadKey]);

  const shown = onlyShort ? rows.filter((r) => r.remaining > 0) : rows;

  function rateColor(r: Row) {
    if (r.ordered === 0) return "text-gray-400";
    if (r.completed >= r.ordered) return "text-green-600";
    if (r.rate >= 0.5) return "text-amber-600";
    return "text-red-600";
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 font-bold">
          <ChevronDown className={`size-4 text-gray-400 transition-transform ${open ? "" : "-rotate-90"}`} />
          受注 vs 製造 達成状況
        </button>
        {totals && (
          <span className="text-xs text-gray-500 hidden sm:flex items-center gap-3">
            <span>受注 {totals.ordered.toLocaleString()}</span>
            <span>完成 {totals.completed.toLocaleString()}</span>
            {totals.remaining > 0
              ? <span className="text-red-600 font-medium">不足 {totals.remaining.toLocaleString()}</span>
              : <span className="text-green-600 font-medium">全て達成 ✓</span>}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={onlyShort} onChange={(e) => setOnlyShort(e.target.checked)} />
            不足のみ
          </label>
          <button onClick={load} title="更新" className="text-gray-400 hover:text-gray-700">
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500 border-r">商品</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">受注数</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">製造依頼</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">完成数</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">不足</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500 w-40">達成率</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-400 py-6">対象の商品がありません</td></tr>
              ) : shown.map((r) => {
                const pct = Math.min(100, Math.round(r.rate * 100));
                return (
                  <tr key={r.productId} className={`hover:bg-gray-50 ${r.achieved ? "bg-green-50/40" : ""}`}>
                    <td className="px-3 py-2 border-r">
                      <span className="font-medium">{r.shortName || r.name}</span>
                      <span className="text-xs text-gray-400 ml-1">{r.code}</span>
                    </td>
                    <td className="px-3 py-2 text-right border-r tabular-nums">{r.ordered.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right border-r tabular-nums text-gray-500">{r.requested.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right border-r tabular-nums font-medium">{r.completed.toLocaleString()}</td>
                    <td className={`px-3 py-2 text-right border-r tabular-nums font-medium ${r.remaining > 0 ? "text-red-600" : "text-gray-300"}`}>
                      {r.remaining > 0 ? r.remaining.toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.ordered === 0 ? (
                        <span className="text-xs text-gray-400">受注なし（在庫製造 {r.completed.toLocaleString()}）</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-[60px]">
                            <div
                              className={`rounded-full h-2 ${r.completed >= r.ordered ? "bg-green-500" : r.rate >= 0.5 ? "bg-amber-500" : "bg-red-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs tabular-nums w-10 text-right ${rateColor(r)}`}>
                            {pct}%
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {totals && shown.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-bold">
                  <td className="px-3 py-2 border-r">合計</td>
                  <td className="px-3 py-2 text-right border-r tabular-nums">{totals.ordered.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right border-r tabular-nums text-gray-500">{totals.requested.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right border-r tabular-nums">{totals.completed.toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right border-r tabular-nums ${totals.remaining > 0 ? "text-red-600" : "text-gray-300"}`}>
                    {totals.remaining > 0 ? totals.remaining.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {totals.ordered > 0 ? `${Math.round((totals.completed / totals.ordered) * 100)}%` : "-"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="text-[11px] text-gray-400 px-3 py-2">
            ※ 受注数=キャンセル以外の受注合計。製造依頼=製造の依頼数。完成数=内職の納品済（達成の基準）。不足=受注−完成。
          </p>
        </div>
      )}
    </Card>
  );
}
