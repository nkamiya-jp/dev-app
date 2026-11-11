"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allocateStock } from "@/lib/sales-plan";

interface Channel { id: string; label: string; ratePct: number | null; price: number; unitGross: number }
interface Row { channel: string; contactId: string | null; qty: Record<string, number> }

const man = (n: number) => `${(Math.round(n / 1000) / 10).toLocaleString()}万円`;
const mLabel = (ym: string) => `${Number(ym.slice(5, 7))}月`;

// 1か月の在庫を、カテゴリごとの「売れる上限」の中でどう振り分けると、どれだけ売れるか
// 売上重視（単価の高い順）と粗利重視（1個の粗利の高い順）の2通りを並べ、選んだ方を計画に入れる
export function MonthAllocator({
  months, channels, rows, monthEndStock, production, openingStock, defaultMonth, onApply,
}: {
  months: string[];
  channels: Channel[];
  rows: Row[];
  monthEndStock: Record<string, number>;
  production: Record<string, number>;
  openingStock: number;
  defaultMonth: string;
  onApply: (month: string, qty: Record<string, number>) => void;
}) {
  const [month, setMonth] = useState(defaultMonth);
  const idx = months.indexOf(month);
  // その月に使える在庫 ＝ 前の月末の在庫（最初の月は期首の在庫）＋ その月の生産
  const available = (idx > 0 ? monthEndStock[months[idx - 1]] ?? 0 : openingStock) + (production[month] || 0);
  const [stock, setStock] = useState(String(Math.max(0, available)));
  const [caps, setCaps] = useState<Record<string, string>>({});

  // 月を変えたら、使える在庫と、今の計画の数（カテゴリごとの合計）を上限の初期値にする
  useEffect(() => {
    setStock(String(Math.max(0, available)));
    const init: Record<string, string> = {};
    for (const r of rows) {
      const q = r.qty[month] || 0;
      if (q) init[r.channel] = String((Number(init[r.channel]) || 0) + q);
    }
    setCaps(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const sellable = channels.filter((c) => c.price > 0);
  const list = sellable.map((c) => ({ key: c.id, price: c.price, unitGross: c.unitGross, cap: Number(caps[c.id]) || 0 }));
  const s = Number(stock) || 0;
  const byRevenue = allocateStock(s, list, "revenue");
  const byGross = allocateStock(s, list, "gross");
  const capTotal = list.reduce((a, c) => a + c.cap, 0);
  const hasCustomerRows = rows.some((r) => r.contactId && (r.qty[month] || 0) > 0);

  return (
    <Card className="bg-white shadow-sm border-indigo-200">
      <CardContent className="py-3 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <p className="text-sm font-medium w-full">1か月の振り分け：在庫をどう振り分けると、どれだけ売れるか</p>
          <div>
            <label className="text-[11px] text-gray-500">月</label>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="block border rounded-md px-2 py-1.5 text-sm bg-white">
              {months.map((m) => <option key={m} value={m}>{mLabel(m)}（{m.slice(0, 4)}）</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">使える在庫（個）</label>
            <Input value={stock} onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" className="w-28" />
          </div>
          <p className="text-[11px] text-gray-500 pb-2">計画では {mLabel(month)} に使える在庫は {Math.max(0, available).toLocaleString()}個（前月末の在庫＋その月の生産）</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b">
              <tr>
                <th className="text-left py-1">カテゴリ</th>
                <th className="text-right py-1">単価</th>
                <th className="text-right py-1">1個の粗利</th>
                <th className="text-right py-1">売れる上限（その月）</th>
                <th className="text-right py-1 bg-sky-50">売上重視</th>
                <th className="text-right py-1 bg-emerald-50">粗利重視</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sellable.map((c) => (
                <tr key={c.id}>
                  <td className="py-1">{c.label}<span className="text-xs text-gray-400 ml-1">{c.ratePct}%</span></td>
                  <td className="text-right tabular-nums">{c.price.toLocaleString()}</td>
                  <td className={`text-right tabular-nums ${c.unitGross < 0 ? "text-rose-600" : ""}`}>{c.unitGross.toLocaleString()}</td>
                  <td className="text-right py-1">
                    <Input
                      value={caps[c.id] ?? ""}
                      onChange={(e) => setCaps((x) => ({ ...x, [c.id]: e.target.value.replace(/[^\d]/g, "") }))}
                      inputMode="numeric"
                      placeholder="0"
                      className="w-24 ml-auto h-8 text-right"
                    />
                  </td>
                  <td className="text-right tabular-nums bg-sky-50/50">{byRevenue.qty[c.id] ? byRevenue.qty[c.id].toLocaleString() : "-"}</td>
                  <td className="text-right tabular-nums bg-emerald-50/50">{byGross.qty[c.id] ? byGross.qty[c.id].toLocaleString() : "-"}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-1.5" colSpan={3}>合計</td>
                <td className="text-right tabular-nums text-gray-500">{capTotal.toLocaleString()}</td>
                <td className="text-right bg-sky-50/50">
                  <span className="block tabular-nums">売上 {man(byRevenue.revenue)}</span>
                  <span className="block text-xs text-gray-500 font-normal">粗利 {man(byRevenue.gross)}・余り {byRevenue.left.toLocaleString()}個</span>
                </td>
                <td className="text-right bg-emerald-50/50">
                  <span className="block tabular-nums">売上 {man(byGross.revenue)}</span>
                  <span className="block text-xs text-gray-500 font-normal">粗利 {man(byGross.gross)}・余り {byGross.left.toLocaleString()}個</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {capTotal === 0 ? (
          <p className="text-xs text-gray-500">カテゴリごとに、その月に「売れそうな上限」の数を入れてください。上限の中で、単価または1個の粗利が高いカテゴリから順に在庫を割り当てます。</p>
        ) : capTotal < s ? (
          <p className="text-xs text-amber-700">上限の合計（{capTotal.toLocaleString()}個）が在庫より少ないので、{(s - capTotal).toLocaleString()}個は売れ残ります。上限を見直すか、生産を減らす目安にしてください。</p>
        ) : null}
        {hasCustomerRows && <p className="text-xs text-amber-700">この月には顧客ごとの行もあります。計画に入れるのは「顧客未定」の行だけなので、二重にならないよう顧客の行を確認してください。</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" disabled={!byRevenue.sold} onClick={() => onApply(month, byRevenue.qty)}>売上重視を {mLabel(month)} の計画に入れる</Button>
          <Button size="sm" variant="outline" disabled={!byGross.sold} onClick={() => onApply(month, byGross.qty)}>粗利重視を {mLabel(month)} の計画に入れる</Button>
        </div>
      </CardContent>
    </Card>
  );
}
