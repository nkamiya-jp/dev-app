"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Save } from "lucide-react";

interface ShopRow { id: string; label: string; todayQty: number }
interface Row {
  productId: string; code: string; name: string; series: string | null;
  price: number | null; forecast: number; orderedMonth: number; today: number;
}
interface Detail {
  date: string; month: string;
  contact: { id: string; label: string };
  orderId: string | null;
  rows: Row[];
  others: { productId: string; code: string; name: string }[];
}

const todayJst = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const shiftDay = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00+09:00`).getTime() + n * 24 * 3600 * 1000;
  return new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
};
const dayLabel = (d: string) => {
  const dt = new Date(`${d}T00:00:00Z`); // 日付だけを見るのでUTCで読む（端末のタイムゾーンでずれないように）
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}（${"日月火水木金土"[dt.getUTCDay()]}）`;
};

// 毎日伺うお店の注文入力：お店を選ぶ → 商品ごとに今日の数を入れて保存 → その日の受注になる
export default function DailyOrdersPage() {
  const [date, setDate] = useState(todayJst());
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [shopId, setShopId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [addId, setAddId] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const loadShops = useCallback(async (d: string) => {
    const res = await fetch(`/api/orders/daily?date=${d}`);
    if (!res.ok) return;
    const j = await res.json();
    setShops(j.contacts);
  }, []);

  const loadDetail = useCallback(async (id: string, d: string) => {
    if (!id) { setDetail(null); return; }
    const res = await fetch(`/api/orders/daily?contactId=${id}&date=${d}`);
    if (!res.ok) { setDetail(null); return; }
    const j: Detail = await res.json();
    setDetail(j);
    setQty(Object.fromEntries(j.rows.map((r) => [r.productId, r.today ? String(r.today) : ""])));
    setExtra([]);
    setMsg("");
  }, []);

  useEffect(() => { void loadShops(date); }, [date, loadShops]);
  useEffect(() => { void loadDetail(shopId, date); }, [shopId, date, loadDetail]);

  const rows: Row[] = useMemo(() => {
    if (!detail) return [];
    const added = extra
      .map((id) => detail.others.find((o) => o.productId === id))
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => ({ productId: o.productId, code: o.code, name: o.name, series: null, price: null, forecast: 0, orderedMonth: 0, today: 0 }));
    return [...detail.rows, ...added];
  }, [detail, extra]);

  const dirty = rows.some((r) => (Number(qty[r.productId]) || 0) !== r.today);
  const todayTotal = rows.reduce((a, r) => a + (Number(qty[r.productId]) || 0), 0);

  async function save() {
    if (!detail) return;
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/orders/daily", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: detail.contact.id,
        date,
        items: rows.map((r) => ({ productId: r.productId, quantity: Number(qty[r.productId]) || 0 })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setMsg((await res.json().catch(() => ({}))).error || "保存できませんでした");
      return;
    }
    setMsg("保存しました");
    await Promise.all([loadDetail(detail.contact.id, date), loadShops(date)]);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold">毎日伺うお店の注文</h1>
        <div className="flex items-center gap-1 ml-auto">
          <Button size="sm" variant="outline" onClick={() => setDate((d) => shiftDay(d, -1))} aria-label="前の日"><ChevronLeft className="size-4" /></Button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="border rounded-md px-2 py-1 text-sm bg-white" />
          <Button size="sm" variant="outline" onClick={() => setDate((d) => shiftDay(d, 1))} aria-label="次の日"><ChevronRight className="size-4" /></Button>
          {date !== todayJst() && <Button size="sm" variant="ghost" onClick={() => setDate(todayJst())}>今日</Button>}
        </div>
      </div>
      <p className="text-xs text-gray-500">
        お店を選んで、今日いただいた数を入れて保存すると、その日の受注になります（1店1日で1件）。予想＝今月の予想（月の収支計画の見込み・毎月の数）、残り＝予想−今月の注文。
        お店の一覧は、顧客の画面で「毎日注文」に印をつけたお店です。
      </p>

      <div className="flex flex-wrap gap-2">
        {shops.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setShopId(s.id)}
            className={`px-3 py-1.5 rounded-full border text-sm ${shopId === s.id ? "bg-blue-600 text-white border-blue-600" : "bg-white hover:bg-gray-50"}`}
          >
            {s.label}
            {s.todayQty > 0 && <span className={`ml-1.5 text-xs ${shopId === s.id ? "text-blue-100" : "text-emerald-600"}`}>✓{s.todayQty}</span>}
          </button>
        ))}
        {shops.length === 0 && <p className="text-sm text-gray-400">「毎日注文」のお店がありません。顧客の画面で印をつけてください。</p>}
      </div>

      {detail && (
        <Card className="bg-white shadow-sm">
          <CardContent className="py-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium">{detail.contact.label} ・ {dayLabel(date)}</p>
              {detail.orderId && <Link href="/orders" className="text-xs text-blue-600 hover:underline">受注に入っています</Link>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 border-b">
                  <tr>
                    <th className="text-left py-1.5">商品</th>
                    <th className="text-right py-1.5 px-2">{Number(detail.month.slice(5, 7))}月の予想</th>
                    <th className="text-right py-1.5 px-2">今月の注文</th>
                    <th className="text-right py-1.5 px-2">残り</th>
                    <th className="text-right py-1.5 px-2">今日</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const t = Number(qty[r.productId]) || 0;
                    const ordered = r.orderedMonth + t;
                    const remain = r.forecast - ordered;
                    return (
                      <tr key={r.productId} className="border-b border-gray-100">
                        <td className="py-1.5">
                          {r.name}
                          <span className="text-xs text-gray-400 ml-1">{r.code}</span>
                        </td>
                        <td className="text-right px-2 tabular-nums text-gray-500">{r.forecast || "-"}</td>
                        <td className="text-right px-2 tabular-nums">{ordered || "-"}</td>
                        <td className={`text-right px-2 tabular-nums ${r.forecast === 0 ? "text-gray-300" : remain < 0 ? "text-rose-600" : "text-violet-600"}`}>
                          {r.forecast === 0 ? "-" : remain < 0 ? `+${-remain}` : remain}
                        </td>
                        <td className="text-right px-1 py-1">
                          <input
                            value={qty[r.productId] ?? ""}
                            onChange={(e) => setQty((q) => ({ ...q, [r.productId]: e.target.value.replace(/[^\d]/g, "") }))}
                            inputMode="numeric"
                            placeholder="0"
                            className="w-20 border rounded px-2 py-1 text-right tabular-nums outline-none focus:border-blue-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="py-4 text-center text-gray-400">商品がありません。下から足してください。</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={addId} onChange={(e) => setAddId(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm bg-white max-w-[260px]">
                <option value="">ほかの商品を足す</option>
                {detail.others.filter((o) => !extra.includes(o.productId)).map((o) => <option key={o.productId} value={o.productId}>{o.name}</option>)}
              </select>
              <Button size="sm" variant="outline" disabled={!addId} onClick={() => { setExtra((x) => [...x, addId]); setAddId(""); }}>
                <Plus className="size-4 mr-1" /> 足す
              </Button>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm text-gray-600">今日 {todayTotal.toLocaleString()} 個</span>
                {msg && <span className={`text-xs ${msg === "保存しました" ? "text-emerald-600" : "text-rose-600"}`}>{msg}</span>}
                <Button size="sm" onClick={save} disabled={saving || !dirty}>
                  <Save className="size-4 mr-1" /> {saving ? "保存中..." : "保存"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
