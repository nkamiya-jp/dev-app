"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import type { OrderPrefill } from "./page";

interface Line { productId: string; code: string; name: string; forecast: number | null; monthOrdered: number; weekOrdered: number }
interface Card {
  contactId: string; label: string; perWeek: boolean; lines: Line[];
  monthForecast: number; monthOrdered: number; weekOrdered: number; lastOrderDate: string | null;
}

const OPEN_KEY = "orders.standing.open";
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// 受注ページ上部：定期顧客（顧客ページの☆）の発注カード。今月（伺うスタイルは今週も）の注文を並べ、
// 「発注を入れる」でいつもの商品が入った受注の入力を開く
export function StandingCards({ onOrder, reloadKey }: { onOrder: (p: OrderPrefill) => void; reloadKey?: number }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [month, setMonth] = useState("");
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/orders/standing");
    if (!res.ok) return;
    const j = await res.json();
    setCards(j.cards);
    setMonth(j.month);
  }, []);
  useEffect(() => { void load(); }, [load, reloadKey]);
  useEffect(() => {
    try { const v = localStorage.getItem(OPEN_KEY); if (v != null) setOpen(v === "1"); } catch {}
  }, []);
  const toggle = () => setOpen((o) => { try { localStorage.setItem(OPEN_KEY, o ? "0" : "1"); } catch {} return !o; });

  if (cards.length === 0) return null;
  const mLabel = month ? `${Number(month.slice(5, 7))}月` : "今月";

  return (
    <div className="space-y-2">
      <div>
      <button type="button" onClick={toggle} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
        <ChevronDown className={`size-4 text-gray-400 transition-transform ${open ? "" : "-rotate-90"}`} />
        定期顧客（発注カード）
      </button>
      <span className="ml-2 text-xs text-gray-400">{cards.length}件・顧客ページの☆で定期顧客になります。予測は<Link href="/orders-by-product" className="text-blue-600 hover:underline">商品別出荷管理</Link>で入れられます</span>
      </div>
      {open && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const hasQty = c.lines.some((l) => l.forecast != null);
            const none = c.perWeek ? c.weekOrdered === 0 : c.monthOrdered === 0;
            return (
              <div key={c.contactId} className={`rounded-lg border bg-white p-3 space-y-2 ${none ? "border-dashed" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/contacts/${c.contactId}`} className="font-medium text-sm text-blue-700 hover:underline truncate block">{c.label}</Link>
                    <p className="text-[11px] text-gray-400">
                      {c.perWeek ? "毎日伺い" : "発注"}
                      {c.lastOrderDate && `・前回 ${md(c.lastOrderDate)}`}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[11px] rounded px-1.5 py-0.5 ${none ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700"}`}>
                    {none ? (c.perWeek ? "今週まだ" : `${mLabel}まだ発注なし`) : c.perWeek ? `今週 ${c.weekOrdered}個` : `${mLabel} ${c.monthOrdered}個`}
                  </span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="text-left font-normal">商品</th>
                      {c.perWeek && <th className="text-right font-normal">今週</th>}
                      <th className="text-right font-normal">{mLabel}</th>
                      {hasQty && <th className="text-right font-normal">予測</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {c.lines.map((l) => (
                      <tr key={l.productId}>
                        <td className="truncate max-w-[160px]">{l.name}</td>
                        {c.perWeek && <td className="text-right tabular-nums">{l.weekOrdered || "-"}</td>}
                        <td className="text-right tabular-nums">{l.monthOrdered || "-"}</td>
                        {hasQty && <td className="text-right tabular-nums text-gray-500">{l.forecast ?? "-"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  onClick={() => onOrder({
                    contactId: c.contactId,
                    // 予測があれば「予測−今月の注文」を入れておく（毎日伺いは毎回聞くので空欄）
                    lines: c.lines.map((l) => ({ productId: l.productId, quantity: c.perWeek || l.forecast == null ? 0 : Math.max(0, l.forecast - l.monthOrdered) })),
                  })}
                  className="w-full inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-gray-50"
                >
                  <Plus className="size-3.5" /> 発注を入れる
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
