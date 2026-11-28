"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import type { OrderPrefill } from "./page";

interface Line { productId: string; code: string; name: string; qty: number; monthQty: number; monthOrdered: number; weekOrdered: number; monthRemain: number }
interface Card {
  contactId: string; label: string; perWeek: boolean; lines: Line[];
  monthQty: number; monthOrdered: number; weekQty: number; weekOrdered: number; lastOrderDate: string | null;
}

const OPEN_KEY = "orders.standing.open";
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// 受注ページ上部：定期のお客さん（発注カード）。想定と今月（伺うスタイルは今週も）の注文を並べ、
// 「発注を入れる」でいつもの商品・数が入った受注の入力を開く
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
      <button type="button" onClick={toggle} className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
        <ChevronDown className={`size-4 text-gray-400 transition-transform ${open ? "" : "-rotate-90"}`} />
        定期のお客さん（発注カード）
        <span className="text-xs font-normal text-gray-400">{cards.length}件・想定は顧客ページの「定期の注文」で変えられます</span>
      </button>
      {open && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const pct = c.perWeek
              ? (c.weekQty > 0 ? c.weekOrdered / c.weekQty : 0)
              : (c.monthQty > 0 ? c.monthOrdered / c.monthQty : 0);
            const none = c.perWeek ? c.weekOrdered === 0 : c.monthOrdered === 0;
            return (
              <div key={c.contactId} className={`rounded-lg border bg-white p-3 space-y-2 ${none ? "border-dashed" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/contacts/${c.contactId}`} className="font-medium text-sm text-blue-700 hover:underline truncate block">{c.label}</Link>
                    <p className="text-[11px] text-gray-400">
                      {c.perWeek ? "伺うスタイル・週あたりの想定" : "月あたりの想定"}
                      {c.lastOrderDate && `・前回 ${md(c.lastOrderDate)}`}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[11px] rounded px-1.5 py-0.5 ${none ? "bg-amber-50 text-amber-700 border border-amber-200" : pct >= 1 ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                    {none ? (c.perWeek ? "今週まだ" : `${mLabel}まだ発注なし`) : c.perWeek ? `今週 ${c.weekOrdered}/${c.weekQty}` : `${mLabel} ${c.monthOrdered}/${c.monthQty}`}
                  </span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="text-left font-normal">商品</th>
                      {c.perWeek && <th className="text-right font-normal">今週</th>}
                      <th className="text-right font-normal">{mLabel}</th>
                      <th className="text-right font-normal">想定</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.lines.map((l) => (
                      <tr key={l.productId}>
                        <td className="truncate max-w-[160px]">{l.name}</td>
                        {c.perWeek && <td className="text-right tabular-nums">{l.weekOrdered || "-"}</td>}
                        <td className="text-right tabular-nums">{l.monthOrdered || "-"}</td>
                        <td className="text-right tabular-nums text-gray-500">{l.qty}{c.perWeek ? "/週" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  onClick={() => onOrder({
                    contactId: c.contactId,
                    // 伺うスタイルは数を毎回聞くので空欄、発注のお客さんは「想定−今月の注文」を入れておく
                    lines: c.lines.map((l) => ({ productId: l.productId, quantity: c.perWeek ? 0 : Math.max(0, l.monthQty - l.monthOrdered) })),
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
