"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { getContactTypeColor, getContactTypeLabel } from "@/lib/contact-meta";

interface Week {
  monday: string;
  startDate: string;
  endDate: string;
  label: string;
}

interface Row {
  id: string;
  orderId: string;
  orderDate: string;
  contactId: string;
  contactName: string;
  company: string | null;
  contactType: string | null;
  productId: string;
  productCode: string;
  productName: string;
  productSeries: string | null;
  totalQuantity: number;
  shippedQty: number;
  remainQty: number;
  unitPrice: number | null;
  monthlyPlan: number;
  weeklyPlans: Record<string, number>;
}

interface ApiResponse {
  month: string;
  weeks: Week[];
  items: Row[];
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ymLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${y}年${m}月`;
}

export default function ShippingPlanPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<ApiResponse | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/shipping-plan?month=${month}`);
    setData(await res.json());
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveWeekly(itemId: string, weeklyPlans: Record<string, number>) {
    await fetch("/api/shipping-plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, weeklyPlans }),
    });
    if (data) {
      setData({
        ...data,
        items: data.items.map((it) =>
          it.id === itemId ? { ...it, weeklyPlans } : it
        ),
      });
    }
  }

  async function saveMonthly(itemId: string, value: number) {
    // OrderItem.monthlyPlans を更新（指定月のみ）
    const item = data?.items.find((it) => it.id === itemId);
    if (!item) return;
    // 既存のmonthlyPlans全体を取得して特定月のみ更新するため、完全データが必要
    // ここは簡易: 当該月のみセット
    const monthlyPlans = { [month]: value };
    await fetch("/api/shipping-plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, monthlyPlans }),
    });
    if (data) {
      setData({
        ...data,
        items: data.items.map((it) =>
          it.id === itemId ? { ...it, monthlyPlan: value } : it
        ),
      });
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data.items;
    const q = search.toLowerCase();
    return data.items.filter(
      (it) =>
        it.contactName.toLowerCase().includes(q) ||
        (it.company || "").toLowerCase().includes(q) ||
        it.productName.toLowerCase().includes(q) ||
        it.productCode.toLowerCase().includes(q)
    );
  }, [data, search]);

  // 週ごと合計
  const weeklyTotals = useMemo(() => {
    if (!data) return {};
    const totals: Record<string, number> = {};
    for (const w of data.weeks) totals[w.monday] = 0;
    for (const it of filtered) {
      for (const w of data.weeks) {
        totals[w.monday] += it.weeklyPlans[w.monday] || 0;
      }
    }
    return totals;
  }, [data, filtered]);

  const monthlyTotal = filtered.reduce((s, it) => s + it.monthlyPlan, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">出荷計画</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
            <Input
              placeholder="顧客・商品で検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-56"
            />
          </div>
        </div>
      </div>

      {/* 期間選択 */}
      <Card className="bg-white shadow-sm">
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500">対象月:</span>
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="p-1 rounded border hover:bg-gray-50"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-base font-bold">{ymLabel(month)}</span>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="p-1 rounded border hover:bg-gray-50"
          >
            <ChevronRight className="size-4" />
          </button>
          <Button variant="outline" size="sm" onClick={() => setMonth(currentMonth())} className="ml-2">
            今月
          </Button>
          <span className="text-xs text-gray-400 ml-auto">
            {filtered.length}件 / 月計画合計: {monthlyTotal.toLocaleString()}個
          </span>
        </CardContent>
      </Card>

      {/* メイングリッド */}
      <Card className="bg-white shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500 border-r min-w-[80px]">注文日</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500 border-r min-w-[140px]">出荷先</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500 border-r min-w-[180px]">商品</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 border-r w-20">注文数</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 border-r w-20">出荷済</th>
                <th className="text-center px-3 py-2 font-medium text-blue-600 border-r w-24 bg-blue-50">
                  {month.split("-")[1].replace(/^0/, "")}月計画
                </th>
                {data?.weeks.map((w) => (
                  <th key={w.monday} className="text-center px-2 py-2 font-medium text-gray-500 border-r min-w-[80px]">
                    <div className="text-xs">{w.label}</div>
                  </th>
                ))}
                <th className="text-right px-3 py-2 font-medium text-gray-500 w-20">週合計</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={(data?.weeks.length || 0) + 7} className="text-center text-gray-400 py-8">
                    {month}対応予定の受注がありません
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const weekSum = data!.weeks.reduce((s, w) => s + (row.weeklyPlans[w.monday] || 0), 0);
                  const mismatch = weekSum > 0 && weekSum !== row.monthlyPlan;
                  return (
                    <tr key={row.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 border-r text-xs text-gray-600">
                        {new Date(row.orderDate).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                      </td>
                      <td className="px-3 py-2 border-r">
                        <div className="font-medium text-sm">{row.contactName}</div>
                        {row.company && <div className="text-xs text-gray-500">{row.company}</div>}
                        {row.contactType && (
                          <Badge className={`text-[10px] mt-0.5 ${getContactTypeColor(row.contactType)}`}>
                            {getContactTypeLabel(row.contactType)}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 border-r">
                        <div className="font-mono text-xs text-gray-500">{row.productCode}</div>
                        <div className="text-sm">{row.productName}</div>
                      </td>
                      <td className="px-3 py-2 text-right border-r font-medium">
                        {row.totalQuantity}
                      </td>
                      <td className="px-3 py-2 text-right border-r text-xs text-green-600">
                        {row.shippedQty}
                      </td>
                      <td className="px-2 py-1 text-center border-r bg-blue-50/30">
                        <NumCell
                          value={row.monthlyPlan}
                          onSave={(v) => saveMonthly(row.id, v)}
                          className="border-blue-300 bg-blue-50 text-blue-700 font-medium"
                        />
                      </td>
                      {data?.weeks.map((w) => (
                        <td key={w.monday} className="px-2 py-1 text-center border-r">
                          <NumCell
                            value={row.weeklyPlans[w.monday] || 0}
                            onSave={(v) => saveWeekly(row.id, { ...row.weeklyPlans, [w.monday]: v })}
                          />
                        </td>
                      ))}
                      <td className={`px-3 py-2 text-right text-xs font-medium ${mismatch ? "text-orange-600" : ""}`}>
                        {weekSum}
                        {mismatch && <span className="text-[10px] ml-1">⚠</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && data && (
              <tfoot className="bg-gray-50 border-t-2 sticky bottom-0">
                <tr>
                  <td colSpan={5} className="px-3 py-2 font-bold border-r text-right">合計</td>
                  <td className="px-2 py-2 text-center border-r bg-blue-50 font-bold text-blue-700">
                    {monthlyTotal.toLocaleString()}
                  </td>
                  {data.weeks.map((w) => (
                    <td key={w.monday} className="px-2 py-2 text-center border-r font-bold">
                      {weeklyTotals[w.monday]?.toLocaleString() || "-"}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-bold">
                    {Object.values(weeklyTotals).reduce((s, v) => s + v, 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function NumCell({
  value,
  onSave,
  className = "",
}: {
  value: number;
  onSave: (v: number) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  function commit() {
    const n = Number(draft);
    if (!isNaN(n) && n !== value) onSave(n);
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
          ? `border-gray-200 bg-white hover:bg-gray-50 ${className}`
          : "border-dashed border-gray-200 text-gray-300 hover:bg-blue-50 hover:border-blue-200"
      }`}
    >
      {value > 0 ? value : "-"}
    </button>
  );
}
