"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, RefreshCw, Plus } from "lucide-react";

interface Row {
  productId: string;
  code: string;
  name: string;
  shortName: string | null;
  series: string | null;
  orderRemain: number;
  stock: number;
  inFlight: number;
  toMake: number;
  hasProduction: boolean;
}
interface Totals { orderRemain: number; stock: number; inFlight: number; toMake: number; }

// 納品が必要な商品（受注残があり在庫＋製造中で賄えない）を一覧。
// 対応者に振り分けていない商品も表示し、その場で割り振れる。
export function ProductionNeeded({
  onAssign,
  reloadKey,
}: {
  onAssign: (productId: string) => void;
  reloadKey?: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [open, setOpen] = useState(false);
  const [onlyToMake, setOnlyToMake] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/productions/needed");
    const json = await res.json();
    setRows(json.rows);
    setTotals(json.totals);
  }, []);
  useEffect(() => { load(); }, [load, reloadKey]);

  const shown = onlyToMake ? rows.filter((r) => r.toMake > 0) : rows;

  return (
    <Card className="p-0 overflow-hidden border-l-4 border-l-orange-400">
      <div className="flex items-center gap-3 px-4 py-3 border-b flex-wrap">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 font-bold">
          <ChevronDown className={`size-4 text-gray-400 transition-transform ${open ? "" : "-rotate-90"}`} />
          要製造（納品が必要な商品）
        </button>
        {totals && (
          <span className="text-xs text-gray-500 hidden sm:flex items-center gap-3">
            <span>受注残 {totals.orderRemain.toLocaleString()}</span>
            <span className="text-orange-600 font-medium">作るべき {totals.toMake.toLocaleString()}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={onlyToMake} onChange={(e) => setOnlyToMake(e.target.checked)} />
            作るべきのみ
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
                <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">受注残</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">在庫</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">製造中</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">作るべき</th>
                <th className="px-3 py-2 w-40"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-400 py-6">
                  {onlyToMake ? "作るべき商品はありません（在庫・製造中で充足）" : "受注残のある商品はありません"}
                </td></tr>
              ) : shown.map((r) => (
                <tr key={r.productId} className={`hover:bg-gray-50 ${r.toMake > 0 ? "bg-orange-50/40" : ""}`}>
                  <td className="px-3 py-2 border-r">
                    <span className="font-medium">{r.shortName || r.name}</span>
                    <span className="text-xs text-gray-400 ml-1">{r.code}</span>
                    {!r.hasProduction && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">未依頼</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right border-r tabular-nums">{r.orderRemain.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right border-r tabular-nums text-gray-500">{r.stock.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right border-r tabular-nums text-blue-600">{r.inFlight > 0 ? r.inFlight.toLocaleString() : "—"}</td>
                  <td className={`px-3 py-2 text-right border-r tabular-nums font-bold ${r.toMake > 0 ? "text-orange-600" : "text-gray-300"}`}>
                    {r.toMake > 0 ? r.toMake.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => onAssign(r.productId)}>
                      <Plus className="size-3.5 mr-1" /> 対応者を割り振る
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            {totals && shown.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-bold">
                  <td className="px-3 py-2 border-r">合計</td>
                  <td className="px-3 py-2 text-right border-r tabular-nums">{totals.orderRemain.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right border-r tabular-nums text-gray-500">{totals.stock.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right border-r tabular-nums text-blue-600">{totals.inFlight.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right border-r tabular-nums text-orange-600">{totals.toMake.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="text-[11px] text-gray-400 px-3 py-2">
            ※ 受注残=未出荷の受注合計。作るべき=受注残−在庫−製造中（未納品の割当）。0以下は充足。
          </p>
        </div>
      )}
    </Card>
  );
}
