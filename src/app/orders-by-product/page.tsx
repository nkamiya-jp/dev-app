"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer, ChevronDown, ChevronUp } from "lucide-react";
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
interface Group {
  productId: string;
  code: string;
  name: string;
  series: string | null;
  orderCount: number;
  openQty: number;
  stock: number;
  prodByMonth: Record<string, number>;
  rows: Row[];
}
interface Resp {
  products: { id: string; code: string; name: string; series: string | null }[];
  months: string[];
  weeks: Week[];
  groups: Group[];
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const COLLAPSE_KEY = "obp-collapsed-products";

/** インライン数値入力セル。空=0。フォーカスアウト or Enter で保存。 */
function NumCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
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
      className="w-full bg-transparent text-right outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5"
    />
  );
}

export default function OrdersByProductPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Resp | null>(null);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hideEmpty, setHideEmpty] = useState(true);
  const restored = useRef(false);

  // localStorage 復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw)));
    } catch {}
    restored.current = true;
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    const res = await fetch(`/api/orders/by-product?${params}`);
    setData(await res.json());
  }, [month]);

  useEffect(() => { load(); }, [load]);

  function persistCollapsed(next: Set<string>) {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])); } catch {}
  }
  function toggleCollapse(pid: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      persistCollapsed(next);
      return next;
    });
  }

  // 商品の表示順（全画面共通の sortOrder）を、表示中の隣の商品と入れ替える
  const reorderProduct = useCallback(async (id: string, targetId: string | undefined) => {
    if (!targetId) return;
    await fetch("/api/products/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, targetId, withinSeries: false }),
    });
    load();
  }, [load]);
  function expandAll() {
    const next = new Set<string>();
    setCollapsed(next);
    persistCollapsed(next);
  }
  function collapseAll(groups: Group[]) {
    const next = new Set(groups.map((g) => g.productId));
    setCollapsed(next);
    persistCollapsed(next);
  }

  // 楽観更新 + 保存
  const saveCell = useCallback(
    async (itemId: string, kind: "monthly" | "weekly", key: string, val: number) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          groups: prev.groups.map((g) => ({
            ...g,
            rows: g.rows.map((r) => {
              if (r.itemId !== itemId) return r;
              if (kind === "monthly") return { ...r, monthlyPlans: { ...r.monthlyPlans, [key]: val } };
              return { ...r, weeklyPlans: { ...r.weeklyPlans, [key]: val } };
            }),
          })),
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

  const { months, weeks } = data;
  const visibleGroups = data.groups.filter((g) => !hideEmpty || g.orderCount > 0);

  function exportCSV() {
    const header = ["商品", "注文日", "出荷先", "注文数", ...months.map((m) => `${Number(m.split("-")[1])}月対応`), "出荷済数", "出荷日(個数)", ...weeks.map((w) => w.label)];
    const body: string[][] = [];
    for (const g of visibleGroups) {
      for (const r of g.rows) {
        body.push([
          g.name, fmtDate(r.orderDate), r.contactName, String(r.quantity),
          ...months.map((m) => String(r.monthlyPlans[m] || "")),
          String(r.shippedQty), r.shipStr,
          ...weeks.map((w) => String(r.weeklyPlans[w.monday] || "")),
        ]);
      }
    }
    const csv = [header, ...body].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `出荷管理表_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const colCount = months.length + weeks.length + 5;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-2xl font-bold">商品別 出荷管理</h2>
          <p className="text-xs text-gray-500 mt-1">全商品の出荷管理表。商品ごとに折りたためます（状態は記憶）。青・橙のセルに直接入力→自動保存。</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {saving && <span className="text-xs text-gray-400">保存中…</span>}
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
            title="表示月（月別列・週バケツの基準月）"
          />
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="size-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4 mr-1" /> 印刷
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm print:hidden">
        <button onClick={() => expandAll()} className="text-blue-600 hover:underline">すべて展開</button>
        <button onClick={() => collapseAll(visibleGroups)} className="text-blue-600 hover:underline">すべて折りたたむ</button>
        <label className="flex items-center gap-1.5 text-gray-600 ml-auto cursor-pointer">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
          受注のない商品を隠す
        </label>
      </div>

      {visibleGroups.length === 0 ? (
        <Card className="bg-white shadow-sm py-12 text-center text-gray-400">
          <p>{hideEmpty ? "受注のある商品がありません" : "商品がありません"}</p>
        </Card>
      ) : (
        visibleGroups.map((g, gi) => {
          const isCollapsed = collapsed.has(g.productId);
          const prevId = visibleGroups[gi - 1]?.productId;
          const nextId = visibleGroups[gi + 1]?.productId;
          const totalQty = g.rows.reduce((s, r) => s + r.quantity, 0);
          const totalShipped = g.rows.reduce((s, r) => s + r.shippedQty, 0);
          const monthTotals: Record<string, number> = {};
          for (const m of months) monthTotals[m] = g.rows.reduce((s, r) => s + (r.monthlyPlans[m] || 0), 0);
          const weekTotals: Record<string, number> = {};
          for (const w of weeks) weekTotals[w.monday] = g.rows.reduce((s, r) => s + (r.weeklyPlans[w.monday] || 0), 0);

          // 在庫残見込 = 在庫 + 累積(製造入荷予定 − 出荷予定)
          const monthBal: Record<string, number> = {};
          let bal = g.stock;
          for (const m of months) {
            bal += (g.prodByMonth[m] || 0) - (monthTotals[m] || 0);
            monthBal[m] = bal;
          }
          // 週別残見込（選択月）: 選択月の月初残 + 当月製造入荷 − 累積週別出荷
          let weekStart = g.stock;
          for (const m of months) { if (m < month) weekStart += (g.prodByMonth[m] || 0) - (monthTotals[m] || 0); }
          weekStart += g.prodByMonth[month] || 0;
          const weekBal: Record<string, number> = {};
          let wb = weekStart;
          for (const w of weeks) { wb -= (weekTotals[w.monday] || 0); weekBal[w.monday] = wb; }

          return (
            <Card key={g.productId} className="bg-white shadow-sm overflow-hidden">
              {/* 商品ヘッダー */}
              <div className="w-full flex items-center gap-3 px-4 py-3 border-b hover:bg-gray-50">
                {/* 並べ替え ↑↓ */}
                <div className="flex flex-col print:hidden">
                  <button
                    onClick={() => reorderProduct(g.productId, prevId)}
                    disabled={!prevId}
                    className="text-gray-400 hover:text-blue-600 disabled:opacity-20 leading-none"
                    title="上へ"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    onClick={() => reorderProduct(g.productId, nextId)}
                    disabled={!nextId}
                    className="text-gray-400 hover:text-blue-600 disabled:opacity-20 leading-none"
                    title="下へ"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                </div>
                <button
                  onClick={() => toggleCollapse(g.productId)}
                  className="flex items-center gap-3 flex-1 text-left print:cursor-default"
                >
                  <ChevronDown className={`size-4 text-gray-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  <span className="font-bold">{g.name}</span>
                  <span className="text-xs text-gray-400">{g.code}</span>
                  <span className="ml-auto flex items-center gap-3 text-xs text-gray-500">
                    <span>受注 {g.orderCount}件</span>
                    <span>注文計 {totalQty.toLocaleString()}</span>
                    {g.openQty > 0
                      ? <span className="text-amber-600 font-medium">未出荷 {g.openQty.toLocaleString()}</span>
                      : g.orderCount > 0 && <span className="text-green-600">完了</span>}
                  </span>
                </button>
              </div>

              {!isCollapsed && (
                <div className="overflow-x-auto">
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
                      {g.rows.length === 0 ? (
                        <tr><td colSpan={colCount} className="text-center text-gray-400 py-6">受注なし</td></tr>
                      ) : (
                        g.rows.map((r) => {
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
                    {g.rows.length > 0 && (
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
                        {/* 製造入荷予定 */}
                        <tr className="bg-blue-50/40 text-blue-700">
                          <td className="px-2 py-1.5 border-r" colSpan={2}>製造入荷予定</td>
                          <td className="border-r"></td>
                          {months.map((m) => (
                            <td key={m} className="px-2 py-1.5 text-right border-r tabular-nums">{g.prodByMonth[m] ? `+${g.prodByMonth[m].toLocaleString()}` : ""}</td>
                          ))}
                          <td className="border-r"></td>
                          <td className="border-r"></td>
                          {weeks.map((w) => <td key={w.monday} className="border-r"></td>)}
                        </tr>
                        {/* 在庫残見込（マイナス＝不足＝赤） */}
                        <tr className="bg-gray-50 font-medium">
                          <td className="px-2 py-1.5 border-r" colSpan={2}>
                            在庫残見込 <span className="text-gray-400 font-normal">（現在庫 {g.stock.toLocaleString()}）</span>
                          </td>
                          <td className="border-r"></td>
                          {months.map((m) => (
                            <td key={m} className={`px-2 py-1.5 text-right border-r tabular-nums ${monthBal[m] < 0 ? "text-red-600 font-bold" : "text-gray-700"}`}>
                              {monthBal[m].toLocaleString()}
                            </td>
                          ))}
                          <td className="border-r"></td>
                          <td className="border-r"></td>
                          {weeks.map((w) => (
                            <td key={w.monday} className={`px-2 py-1.5 text-right border-r tabular-nums ${weekBal[w.monday] < 0 ? "text-red-600 font-bold" : "text-gray-600"}`}>
                              {weekBal[w.monday].toLocaleString()}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </Card>
          );
        })
      )}

      <p className="text-xs text-gray-400 print:hidden">
        ※ 月別対応（{months.map((m) => formatMonthLabel(m)).join("・")}）と週別（{formatMonthLabel(month)}の平日週）は青・橙のセルに直接入力→自動保存。出荷済・出荷日は出荷実績から自動表示。灰色行=出荷完了。
      </p>
    </div>
  );
}
