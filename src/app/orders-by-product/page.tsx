"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { formatMonthLabel } from "@/lib/sales-month";

interface Week { monday: string; label: string; }
interface Row {
  itemId: string;
  orderId: string;
  orderDate: string;
  status: string;
  contactId: string | null;
  contactName: string;
  company: string | null;
  quantity: number;
  shippedQty: number;
  remainQty: number;
  monthlyPlans: Record<string, number>;
  shipStr: string;
  weeklyPlans: Record<string, number>;
}
interface ProductOpt { id: string; code: string; name: string; series: string | null; }
interface Resp {
  products: ProductOpt[];
  productId: string | null;
  months: string[];
  weeks: Week[];
  rows: Row[];
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** インライン数値入力セル。空=0。フォーカスアウト or Enter で保存。 */
function NumCell({
  value,
  onSave,
  className = "",
}: {
  value: number;
  onSave: (v: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(value ? String(value) : "");
  useEffect(() => { setText(value ? String(value) : ""); }, [value]);

  function commit() {
    const n = Number(text) || 0;
    if (n !== value) onSave(n);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={`w-full bg-transparent text-right outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 ${className}`}
    />
  );
}

export default function OrdersByProductPage() {
  const [productId, setProductId] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Resp | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (productId) params.set("productId", productId);
    if (month) params.set("month", month);
    const res = await fetch(`/api/orders/by-product?${params}`);
    setData(await res.json());
  }, [productId, month]);

  useEffect(() => { load(); }, [load]);

  // 楽観更新 + 保存
  const saveCell = useCallback(
    async (itemId: string, kind: "monthly" | "weekly", key: string, val: number) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((r) => {
            if (r.itemId !== itemId) return r;
            if (kind === "monthly") return { ...r, monthlyPlans: { ...r.monthlyPlans, [key]: val } };
            return { ...r, weeklyPlans: { ...r.weeklyPlans, [key]: val } };
          }),
        };
      });
      setSaving(true);
      try {
        await fetch(`/api/orders/by-product`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId,
            [kind === "monthly" ? "monthlyPlans" : "weeklyPlans"]: { [key]: val },
          }),
        });
      } finally {
        setSaving(false);
      }
    },
    []
  );

  if (!data) return <div className="p-6 text-gray-400">読み込み中...</div>;

  const months = data.months;
  const weeks = data.weeks;
  const rows = data.rows;

  // 合計行
  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const totalShipped = rows.reduce((s, r) => s + r.shippedQty, 0);
  const monthTotals: Record<string, number> = {};
  for (const m of months) monthTotals[m] = rows.reduce((s, r) => s + (r.monthlyPlans[m] || 0), 0);
  const weekTotals: Record<string, number> = {};
  for (const w of weeks) weekTotals[w.monday] = rows.reduce((s, r) => s + (r.weeklyPlans[w.monday] || 0), 0);

  const selectedProduct = data.products.find((p) => p.id === productId);

  function exportCSV() {
    const header = ["注文日", "出荷先", "注文数", ...months.map((m) => `${Number(m.split("-")[1])}月対応`), "出荷済数", "出荷日(個数)", ...weeks.map((w) => w.label)];
    const body = rows.map((r) => [
      fmtDate(r.orderDate), r.contactName, String(r.quantity),
      ...months.map((m) => String(r.monthlyPlans[m] || "")),
      String(r.shippedQty), r.shipStr,
      ...weeks.map((w) => String(r.weeklyPlans[w.monday] || "")),
    ]);
    const csv = [header, ...body].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `出荷管理_${selectedProduct?.name ?? "商品"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-2xl font-bold">商品別 出荷管理</h2>
          <p className="text-xs text-gray-500 mt-1">商品ごとに受注を並べ、月別対応数・週別対応数を入力（自動保存）</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {saving && <span className="text-xs text-gray-400">保存中…</span>}
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm min-w-[200px]"
          >
            <option value="">-- 商品を選択 --</option>
            {data.products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}（{p.code}）</option>
            ))}
          </select>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
            title="表示月（月別列・週バケツの基準月）"
          />
          {productId && (
            <>
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="size-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="size-4 mr-1" /> 印刷
              </Button>
            </>
          )}
        </div>
      </div>

      {!productId ? (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-12 text-center text-gray-400">
            <p>商品を選択すると、その商品の受注一覧が表示されます</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-white shadow-sm">
          <div className="hidden print:block px-4 pt-4">
            <h1 className="text-lg font-bold">{selectedProduct?.name} 出荷管理表</h1>
          </div>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-2 py-2 font-medium text-gray-500 border-r w-16">注文日</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-500 border-r min-w-[130px]">出荷先</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-500 border-r w-16">注文数</th>
                  {months.map((m) => (
                    <th key={m} className="text-right px-2 py-2 font-medium text-gray-500 border-r w-16 bg-blue-50/50">{Number(m.split("-")[1])}月対応</th>
                  ))}
                  <th className="text-right px-2 py-2 font-medium text-gray-500 border-r w-16">出荷済</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-500 border-r min-w-[140px]">出荷日(個数)</th>
                  {weeks.map((w) => (
                    <th key={w.monday} className="text-right px-2 py-2 font-medium text-gray-500 border-r min-w-[70px] bg-amber-50/40">{w.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 ? (
                  <tr><td colSpan={months.length + weeks.length + 5} className="text-center text-gray-400 py-8">この商品の受注はありません</td></tr>
                ) : (
                  rows.map((r) => {
                    const done = r.remainQty <= 0;
                    return (
                      <tr key={r.itemId} className={`hover:bg-gray-50 ${done ? "bg-gray-50/60 text-gray-400" : ""}`}>
                        <td className="px-2 py-1.5 border-r">{fmtDate(r.orderDate)}</td>
                        <td className="px-2 py-1.5 border-r">
                          {r.contactId ? (
                            <Link href={`/contacts/${r.contactId}`} className="text-blue-600 hover:underline">{r.contactName}</Link>
                          ) : r.contactName}
                          {r.company && <span className="text-[10px] text-gray-400 ml-1">{r.company}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium border-r">{r.quantity.toLocaleString()}</td>
                        {months.map((m) => (
                          <td key={m} className="px-1 py-0.5 border-r bg-blue-50/20 print:px-2 print:py-1.5 print:text-right">
                            <span className="hidden print:inline">{r.monthlyPlans[m] ? r.monthlyPlans[m].toLocaleString() : ""}</span>
                            <span className="print:hidden">
                              <NumCell value={r.monthlyPlans[m] || 0} onSave={(v) => saveCell(r.itemId, "monthly", m, v)} />
                            </span>
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right border-r">{r.shippedQty ? r.shippedQty.toLocaleString() : ""}</td>
                        <td className="px-2 py-1.5 border-r text-gray-500">{r.shipStr}</td>
                        {weeks.map((w) => (
                          <td key={w.monday} className="px-1 py-0.5 border-r bg-amber-50/20 print:px-2 print:py-1.5 print:text-right">
                            <span className="hidden print:inline">{r.weeklyPlans[w.monday] ? r.weeklyPlans[w.monday].toLocaleString() : ""}</span>
                            <span className="print:hidden">
                              <NumCell value={r.weeklyPlans[w.monday] || 0} onSave={(v) => saveCell(r.itemId, "weekly", w.monday, v)} />
                            </span>
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-gray-50 font-bold">
                    <td className="px-2 py-2 border-r" colSpan={2}>合計</td>
                    <td className="px-2 py-2 text-right border-r">{totalQty.toLocaleString()}</td>
                    {months.map((m) => (
                      <td key={m} className="px-2 py-2 text-right border-r">{monthTotals[m] ? monthTotals[m].toLocaleString() : ""}</td>
                    ))}
                    <td className="px-2 py-2 text-right border-r">{totalShipped.toLocaleString()}</td>
                    <td className="border-r"></td>
                    {weeks.map((w) => (
                      <td key={w.monday} className="px-2 py-2 text-right border-r">{weekTotals[w.monday] ? weekTotals[w.monday].toLocaleString() : ""}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </CardContent>
        </Card>
      )}

      {productId && (
        <p className="text-xs text-gray-400 print:hidden">
          ※ 月別対応（{months.map((m) => formatMonthLabel(m)).join("・")}）と週別（{formatMonthLabel(month)}の平日週）は青・橙のセルに直接入力→自動保存。出荷済・出荷日は出荷実績から自動表示。灰色行=出荷完了。
        </p>
      )}
    </div>
  );
}
