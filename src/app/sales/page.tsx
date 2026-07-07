"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer, Users, Package } from "lucide-react";
import { formatMonthLabel } from "@/lib/sales-month";

interface Row {
  id: string;
  name: string;
  company?: string | null;
  code?: string | null;
  series?: string | null;
  total: number;
  months: Record<string, number>;
}

interface SalesResponse {
  months: string[];
  customers: Row[];
  products: Row[];
  monthTotals: Record<string, number>;
  generatedAt: string;
}

type Axis = "customer" | "product";

export default function SalesPage() {
  const [data, setData] = useState<SalesResponse | null>(null);
  const [axis, setAxis] = useState<Axis>("customer");
  const [monthCount, setMonthCount] = useState(12);

  const load = useCallback(async () => {
    const res = await fetch("/api/sales");
    setData(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="p-6 text-gray-400">読み込み中...</div>;

  const months = data.months.slice(0, monthCount);
  const rows = axis === "customer" ? data.customers : data.products;
  const isCustomer = axis === "customer";

  function exportCSV() {
    const header = [isCustomer ? "顧客" : "商品", "合計", ...months.map(formatMonthLabel)];
    const body = rows.map((r) => [
      r.name,
      String(r.total),
      ...months.map((m) => String(r.months[m] ?? 0)),
    ]);
    const totalRow = ["月別合計", String(rows.reduce((s, r) => s + r.total, 0)), ...months.map((m) => String(data!.monthTotals[m] ?? 0))];
    const csv = [header, ...body, totalRow].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `月次売上_${isCustomer ? "顧客別" : "商品別"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-2xl font-bold">月次売上</h2>
          <p className="text-xs text-gray-500 mt-1">受注ベース（顧客の締日で月を判定）</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-md border overflow-hidden">
            <button
              onClick={() => setAxis("customer")}
              className={`px-3 py-2 text-sm flex items-center gap-1 ${isCustomer ? "bg-primary text-primary-foreground" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <Users className="size-4" /> 顧客軸
            </button>
            <button
              onClick={() => setAxis("product")}
              className={`px-3 py-2 text-sm flex items-center gap-1 ${!isCustomer ? "bg-primary text-primary-foreground" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <Package className="size-4" /> 商品軸
            </button>
          </div>
          <select
            value={monthCount}
            onChange={(e) => setMonthCount(Number(e.target.value))}
            className="border rounded-md px-3 py-2 text-sm"
          >
            {[6, 12, 24].map((n) => <option key={n} value={n}>直近{n}ヶ月</option>)}
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
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[160px]">
                  {isCustomer ? "顧客" : "商品"}
                </th>
                <th className="text-right px-3 py-2 font-medium text-gray-700 w-24 bg-blue-50">合計</th>
                {months.map((m) => (
                  <th key={m} className="text-right px-3 py-2 font-medium text-gray-500 min-w-[90px]">{formatMonthLabel(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr><td colSpan={months.length + 2} className="text-center text-gray-400 py-8">売上データがありません</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 sticky left-0 bg-white z-10">
                      {isCustomer ? (
                        <Link href={`/contacts/${r.id}`} className="text-blue-600 hover:underline font-medium">{r.name}</Link>
                      ) : (
                        <Link href={`/products/${r.id}`} className="text-blue-600 hover:underline font-medium">{r.name}</Link>
                      )}
                      {!isCustomer && r.code && <div className="text-[10px] font-mono text-gray-400">{r.code}</div>}
                      {isCustomer && r.company && <div className="text-[10px] text-gray-400">{r.company}</div>}
                    </td>
                    <td className="px-3 py-1.5 text-right font-bold bg-blue-50/40">{r.total.toLocaleString()}</td>
                    {months.map((m) => {
                      const v = r.months[m] ?? 0;
                      return (
                        <td key={m} className={`px-3 py-1.5 text-right ${v > 0 ? "" : "text-gray-300"}`}>
                          {v > 0 ? v.toLocaleString() : "-"}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-bold">
                  <td className="px-3 py-2 sticky left-0 bg-gray-50">月別合計</td>
                  <td className="px-3 py-2 text-right bg-blue-100/50">{grandTotal.toLocaleString()}</td>
                  {months.map((m) => (
                    <td key={m} className="px-3 py-2 text-right">{(data.monthTotals[m] ?? 0).toLocaleString()}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400 print:hidden">
        ※ キャンセル以外の受注を集計。金額は明細（単価×数量）の合計。締日は顧客編集で設定できます。
      </p>
    </div>
  );
}
