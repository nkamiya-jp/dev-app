"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Search, Users, Package } from "lucide-react";
import { getContactTypeColor, getContactTypeLabel, CONTACT_TYPES } from "@/lib/contact-meta";
import { PRODUCT_SERIES, getSeriesLabel, getSeriesColor } from "@/lib/product-meta";

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

type ViewMode = "detail" | "byCustomer" | "byProduct";

export default function ShippingPlanPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<ApiResponse | null>(null);
  const [search, setSearch] = useState("");
  const [contactFilter, setContactFilter] = useState("");
  const [contactTypeFilter, setContactTypeFilter] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [view, setView] = useState<ViewMode>("detail");

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
        items: data.items.map((it) => (it.id === itemId ? { ...it, weeklyPlans } : it)),
      });
    }
  }

  async function saveMonthly(itemId: string, value: number) {
    const monthlyPlans = { [month]: value };
    await fetch("/api/shipping-plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, monthlyPlans }),
    });
    if (data) {
      setData({
        ...data,
        items: data.items.map((it) => (it.id === itemId ? { ...it, monthlyPlan: value } : it)),
      });
    }
  }

  // 顧客一覧（フィルタ用）
  const contactOptions = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { id: string; name: string; company: string | null }>();
    for (const it of data.items) {
      if (!map.has(it.contactId)) {
        map.set(it.contactId, { id: it.contactId, name: it.contactName, company: it.company });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.items;
    if (contactFilter) list = list.filter((it) => it.contactId === contactFilter);
    if (contactTypeFilter) list = list.filter((it) => it.contactType === contactTypeFilter);
    if (seriesFilter) list = list.filter((it) => it.productSeries === seriesFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (it) =>
          it.contactName.toLowerCase().includes(q) ||
          (it.company || "").toLowerCase().includes(q) ||
          it.productName.toLowerCase().includes(q) ||
          it.productCode.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, search, contactFilter, contactTypeFilter, seriesFilter]);

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

  function clearFilters() {
    setSearch("");
    setContactFilter("");
    setContactTypeFilter("");
    setSeriesFilter("");
  }

  const hasFilter = !!(search || contactFilter || contactTypeFilter || seriesFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">出荷計画</h2>
      </div>

      {/* 期間 + 表示モード */}
      <Card className="bg-white shadow-sm">
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500">対象月:</span>
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1 rounded border hover:bg-gray-50">
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-base font-bold">{ymLabel(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-1 rounded border hover:bg-gray-50">
            <ChevronRight className="size-4" />
          </button>
          <Button variant="outline" size="sm" onClick={() => setMonth(currentMonth())}>
            今月
          </Button>

          <div className="flex border rounded-md overflow-hidden ml-4">
            <button
              onClick={() => setView("detail")}
              className={`px-3 py-1.5 text-sm ${view === "detail" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}
            >
              明細
            </button>
            <button
              onClick={() => setView("byCustomer")}
              className={`px-3 py-1.5 text-sm flex items-center gap-1 ${view === "byCustomer" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}
            >
              <Users className="size-3.5" /> 顧客別
            </button>
            <button
              onClick={() => setView("byProduct")}
              className={`px-3 py-1.5 text-sm flex items-center gap-1 ${view === "byProduct" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}
            >
              <Package className="size-3.5" /> 商品別
            </button>
          </div>

          <span className="text-xs text-gray-400 ml-auto">
            {filtered.length}件 / 月計画合計: {monthlyTotal.toLocaleString()}個
          </span>
        </CardContent>
      </Card>

      {/* フィルタ */}
      <Card className="bg-white shadow-sm">
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
            <Input
              placeholder="フリー検索（顧客・商品）"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
          <select
            value={contactFilter}
            onChange={(e) => setContactFilter(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm min-w-[160px]"
          >
            <option value="">全顧客</option>
            {contactOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.company ? ` (${c.company})` : ""}
              </option>
            ))}
          </select>
          <select
            value={contactTypeFilter}
            onChange={(e) => setContactTypeFilter(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="">全取引タイプ</option>
            {CONTACT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
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
          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              クリア
            </Button>
          )}
        </CardContent>
      </Card>

      {/* メイングリッド（ビュー切替） */}
      {view === "detail" ? (
        <DetailView
          data={data}
          rows={filtered}
          weeklyTotals={weeklyTotals}
          monthlyTotal={monthlyTotal}
          month={month}
          onSaveWeekly={saveWeekly}
          onSaveMonthly={saveMonthly}
        />
      ) : view === "byCustomer" ? (
        <CustomerView data={data} rows={filtered} month={month} />
      ) : (
        <ProductView data={data} rows={filtered} month={month} />
      )}
    </div>
  );
}

// ─── 明細ビュー ───
function DetailView({
  data,
  rows,
  weeklyTotals,
  monthlyTotal,
  month,
  onSaveWeekly,
  onSaveMonthly,
}: {
  data: ApiResponse | null;
  rows: Row[];
  weeklyTotals: Record<string, number>;
  monthlyTotal: number;
  month: string;
  onSaveWeekly: (id: string, plans: Record<string, number>) => void;
  onSaveMonthly: (id: string, value: number) => void;
}) {
  return (
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={(data?.weeks.length || 0) + 7} className="text-center text-gray-400 py-8">
                  該当データなし
                </td>
              </tr>
            ) : (
              rows.map((row) => {
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
                    <td className="px-3 py-2 text-right border-r font-medium">{row.totalQuantity}</td>
                    <td className="px-3 py-2 text-right border-r text-xs text-green-600">{row.shippedQty}</td>
                    <td className="px-2 py-1 text-center border-r bg-blue-50/30">
                      <NumCell
                        value={row.monthlyPlan}
                        onSave={(v) => onSaveMonthly(row.id, v)}
                        className="border-blue-300 bg-blue-50 text-blue-700 font-medium"
                      />
                    </td>
                    {data?.weeks.map((w) => (
                      <td key={w.monday} className="px-2 py-1 text-center border-r">
                        <NumCell
                          value={row.weeklyPlans[w.monday] || 0}
                          onSave={(v) => onSaveWeekly(row.id, { ...row.weeklyPlans, [w.monday]: v })}
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
          {rows.length > 0 && data && (
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
  );
}

// ─── 顧客別集計ビュー ───
interface CustomerAgg {
  contactId: string;
  contactName: string;
  company: string | null;
  contactType: string | null;
  itemCount: number;
  totalQuantity: number;
  shippedQty: number;
  monthlyPlan: number;
  weeklyPlans: Record<string, number>;
}

function CustomerView({ data, rows, month }: { data: ApiResponse | null; rows: Row[]; month: string }) {
  const aggs = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, CustomerAgg>();
    for (const it of rows) {
      let agg = map.get(it.contactId);
      if (!agg) {
        agg = {
          contactId: it.contactId,
          contactName: it.contactName,
          company: it.company,
          contactType: it.contactType,
          itemCount: 0,
          totalQuantity: 0,
          shippedQty: 0,
          monthlyPlan: 0,
          weeklyPlans: Object.fromEntries(data.weeks.map((w) => [w.monday, 0])),
        };
        map.set(it.contactId, agg);
      }
      agg.itemCount++;
      agg.totalQuantity += it.totalQuantity;
      agg.shippedQty += it.shippedQty;
      agg.monthlyPlan += it.monthlyPlan;
      for (const w of data.weeks) {
        agg.weeklyPlans[w.monday] += it.weeklyPlans[w.monday] || 0;
      }
    }
    return [...map.values()].sort((a, b) => b.monthlyPlan - a.monthlyPlan);
  }, [data, rows]);

  if (!data) return null;

  const weeklyTotals: Record<string, number> = Object.fromEntries(data.weeks.map((w) => [w.monday, 0]));
  let monthlyTotal = 0;
  for (const a of aggs) {
    monthlyTotal += a.monthlyPlan;
    for (const w of data.weeks) weeklyTotals[w.monday] += a.weeklyPlans[w.monday];
  }

  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-500 border-r min-w-[200px]">顧客</th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">商品数</th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">注文数</th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">出荷済</th>
              <th className="text-center px-3 py-2 font-medium text-blue-600 border-r bg-blue-50">
                {month.split("-")[1].replace(/^0/, "")}月計画
              </th>
              {data.weeks.map((w) => (
                <th key={w.monday} className="text-center px-2 py-2 font-medium text-gray-500 border-r min-w-[80px]">
                  <div className="text-xs">{w.label}</div>
                </th>
              ))}
              <th className="text-right px-3 py-2 font-medium text-gray-500">週合計</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {aggs.length === 0 ? (
              <tr>
                <td colSpan={data.weeks.length + 6} className="text-center text-gray-400 py-8">該当データなし</td>
              </tr>
            ) : (
              aggs.map((a) => {
                const wkSum = Object.values(a.weeklyPlans).reduce((s, v) => s + v, 0);
                return (
                  <tr key={a.contactId} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 border-r">
                      <div className="font-medium">{a.contactName}</div>
                      {a.company && <div className="text-xs text-gray-500">{a.company}</div>}
                      {a.contactType && (
                        <Badge className={`text-[10px] mt-0.5 ${getContactTypeColor(a.contactType)}`}>
                          {getContactTypeLabel(a.contactType)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right border-r text-gray-600">{a.itemCount}</td>
                    <td className="px-3 py-2 text-right border-r font-medium">{a.totalQuantity.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right border-r text-green-600 text-xs">{a.shippedQty.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center border-r bg-blue-50/30 font-bold text-blue-700">
                      {a.monthlyPlan.toLocaleString()}
                    </td>
                    {data.weeks.map((w) => (
                      <td key={w.monday} className="px-2 py-2 text-center border-r text-xs">
                        {a.weeklyPlans[w.monday] > 0 ? a.weeklyPlans[w.monday].toLocaleString() : "-"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-medium">{wkSum.toLocaleString()}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {aggs.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2">
              <tr>
                <td colSpan={4} className="px-3 py-2 font-bold border-r text-right">合計</td>
                <td className="px-3 py-2 text-center border-r bg-blue-50 font-bold text-blue-700">
                  {monthlyTotal.toLocaleString()}
                </td>
                {data.weeks.map((w) => (
                  <td key={w.monday} className="px-2 py-2 text-center border-r font-bold">
                    {weeklyTotals[w.monday].toLocaleString()}
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
  );
}

// ─── 商品別集計ビュー ───
interface ProductAgg {
  productId: string;
  productCode: string;
  productName: string;
  productSeries: string | null;
  customerCount: number;
  totalQuantity: number;
  shippedQty: number;
  monthlyPlan: number;
  weeklyPlans: Record<string, number>;
}

function ProductView({ data, rows, month }: { data: ApiResponse | null; rows: Row[]; month: string }) {
  const aggs = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, ProductAgg>();
    const customerSetByProduct = new Map<string, Set<string>>();
    for (const it of rows) {
      let agg = map.get(it.productId);
      if (!agg) {
        agg = {
          productId: it.productId,
          productCode: it.productCode,
          productName: it.productName,
          productSeries: it.productSeries,
          customerCount: 0,
          totalQuantity: 0,
          shippedQty: 0,
          monthlyPlan: 0,
          weeklyPlans: Object.fromEntries(data.weeks.map((w) => [w.monday, 0])),
        };
        map.set(it.productId, agg);
        customerSetByProduct.set(it.productId, new Set());
      }
      agg.totalQuantity += it.totalQuantity;
      agg.shippedQty += it.shippedQty;
      agg.monthlyPlan += it.monthlyPlan;
      customerSetByProduct.get(it.productId)!.add(it.contactId);
      for (const w of data.weeks) {
        agg.weeklyPlans[w.monday] += it.weeklyPlans[w.monday] || 0;
      }
    }
    for (const [pid, agg] of map) {
      agg.customerCount = customerSetByProduct.get(pid)!.size;
    }
    return [...map.values()].sort((a, b) => b.monthlyPlan - a.monthlyPlan);
  }, [data, rows]);

  if (!data) return null;

  const weeklyTotals: Record<string, number> = Object.fromEntries(data.weeks.map((w) => [w.monday, 0]));
  let monthlyTotal = 0;
  for (const a of aggs) {
    monthlyTotal += a.monthlyPlan;
    for (const w of data.weeks) weeklyTotals[w.monday] += a.weeklyPlans[w.monday];
  }

  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-500 border-r min-w-[200px]">商品</th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">顧客数</th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">注文数</th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 border-r">出荷済</th>
              <th className="text-center px-3 py-2 font-medium text-blue-600 border-r bg-blue-50">
                {month.split("-")[1].replace(/^0/, "")}月計画
              </th>
              {data.weeks.map((w) => (
                <th key={w.monday} className="text-center px-2 py-2 font-medium text-gray-500 border-r min-w-[80px]">
                  <div className="text-xs">{w.label}</div>
                </th>
              ))}
              <th className="text-right px-3 py-2 font-medium text-gray-500">週合計</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {aggs.length === 0 ? (
              <tr>
                <td colSpan={data.weeks.length + 6} className="text-center text-gray-400 py-8">該当データなし</td>
              </tr>
            ) : (
              aggs.map((a) => {
                const wkSum = Object.values(a.weeklyPlans).reduce((s, v) => s + v, 0);
                return (
                  <tr key={a.productId} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 border-r">
                      <div className="font-mono text-xs text-gray-500">{a.productCode}</div>
                      <div className="font-medium">{a.productName}</div>
                      {a.productSeries && (
                        <Badge className={`text-[10px] mt-0.5 ${getSeriesColor(a.productSeries)}`}>
                          {getSeriesLabel(a.productSeries)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right border-r text-gray-600">{a.customerCount}</td>
                    <td className="px-3 py-2 text-right border-r font-medium">{a.totalQuantity.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right border-r text-green-600 text-xs">{a.shippedQty.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center border-r bg-blue-50/30 font-bold text-blue-700">
                      {a.monthlyPlan.toLocaleString()}
                    </td>
                    {data.weeks.map((w) => (
                      <td key={w.monday} className="px-2 py-2 text-center border-r text-xs">
                        {a.weeklyPlans[w.monday] > 0 ? a.weeklyPlans[w.monday].toLocaleString() : "-"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-medium">{wkSum.toLocaleString()}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {aggs.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2">
              <tr>
                <td colSpan={4} className="px-3 py-2 font-bold border-r text-right">合計</td>
                <td className="px-3 py-2 text-center border-r bg-blue-50 font-bold text-blue-700">
                  {monthlyTotal.toLocaleString()}
                </td>
                {data.weeks.map((w) => (
                  <td key={w.monday} className="px-2 py-2 text-center border-r font-bold">
                    {weeklyTotals[w.monday].toLocaleString()}
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
