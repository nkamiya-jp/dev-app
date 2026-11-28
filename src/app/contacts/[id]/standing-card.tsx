"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarClock, Plus, X } from "lucide-react";
import { compareProductOrder } from "@/lib/product-meta";

interface Product { id: string; code: string; name: string; series: string | null; sortOrder: number; active: boolean; ownerContactId?: string | null }
interface Row { productId: string; qty: number; startMonth: string }

// 定期のお客さん：いつもの商品と想定数（月あたり。伺うスタイル＝毎日注文の取引先は週あたり）
// ここに入れた商品は、受注の発注カードと商品別出荷管理にいつも出る
export function StandingCard({ contactId, perWeek }: { contactId: string; perWeek: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [addId, setAddId] = useState("");
  const [addQty, setAddQty] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [ps, rs] = await Promise.all([
      fetch("/api/products").then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/monthly-plan/recurring?contactId=${contactId}`).then((r) => (r.ok ? r.json() : [])),
    ]);
    setProducts((Array.isArray(ps) ? ps : []).filter((p: Product) => p.active && (!p.ownerContactId || p.ownerContactId === contactId)).sort(compareProductOrder));
    setRows(Array.isArray(rs) ? rs : []);
  }, [contactId]);
  useEffect(() => { void load(); }, [load]);

  async function save(productId: string, qty: number) {
    setErr("");
    const res = await fetch("/api/monthly-plan/recurring", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, productId, qty }),
    });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error || "保存できませんでした");
    await load();
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const shown = rows.filter((r) => r.qty > 0 && byId.has(r.productId)).sort((a, b) => compareProductOrder(byId.get(a.productId)!, byId.get(b.productId)!));
  const unit = perWeek ? "週あたり" : "月あたり";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarClock className="size-5" />
          定期の注文（想定）
          <span className="text-xs font-normal text-gray-500">{perWeek ? "伺うスタイル：週あたりのおおよその数" : "月あたりの想定数"}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          毎月必ず注文があるお客さんの、いつもの商品と想定数です。ここに入れると、受注ページの発注カードと商品別出荷管理にいつも出ます（注文がまだ無い月も）。
          {perWeek ? "このお客さんは「毎日注文の取引先」なので週あたりで入れます。" : "伺って聞くスタイル（清水エリアなど）のお客さんは、上の編集で「毎日注文の取引先」にすると週あたりになります。"}
        </p>
        {shown.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b">
              <tr>
                <th className="text-left py-1.5">商品</th>
                <th className="text-right py-1.5 px-2">想定（{unit}）</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const p = byId.get(r.productId)!;
                return (
                  <tr key={r.productId} className="border-b border-gray-100">
                    <td className="py-1.5">{p.name} <span className="text-xs text-gray-400">{p.code}</span></td>
                    <td className="text-right px-2">
                      <input
                        key={`${r.productId}_${r.qty}`}
                        defaultValue={String(r.qty)}
                        inputMode="numeric"
                        onBlur={(e) => {
                          const q = Number(e.target.value.replace(/[^\d]/g, "")) || 0;
                          if (q !== r.qty) void save(r.productId, q);
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="w-20 border rounded px-1.5 py-0.5 text-right tabular-nums"
                      />
                    </td>
                    <td className="text-center">
                      <button type="button" onClick={() => void save(r.productId, 0)} className="text-gray-300 hover:text-red-500" title="定期から外す">
                        <X className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={addId} onChange={(e) => setAddId(e.target.value)} className="border rounded-md px-2 py-1.5 bg-white max-w-[260px]">
            <option value="">商品を選ぶ</option>
            {products.filter((p) => !shown.some((r) => r.productId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            value={addQty}
            onChange={(e) => setAddQty(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder={unit}
            className="w-24 border rounded-md px-2 py-1.5 text-right"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!addId || !(Number(addQty) > 0)}
            onClick={async () => { await save(addId, Number(addQty)); setAddId(""); setAddQty(""); }}
          >
            <Plus className="size-4 mr-1" /> 足す
          </Button>
          {err && <span className="text-xs text-rose-600">{err}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
