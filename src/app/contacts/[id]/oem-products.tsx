"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Plus } from "lucide-react";
import { compareProductOrder } from "@/lib/product-meta";

interface OemItem {
  id: string;
  code: string;
  name: string;
  active: boolean;
  cost: { current: number };
  price: number | null;
  pricedAt: string | null;
  multiplier: number | null;
  marginRate: number | null;
  costChange: number | null;
  belowMin: boolean;
}

interface ProductOpt { id: string; code: string; name: string; series: string | null; sortOrder: number; active: boolean; ownerContactId: string | null }

const yen = (n: number | null | undefined) => (n == null ? "-" : `${n.toLocaleString()}円`);

// 顧客 ┗ OEM商品（この顧客専用の商品）。リピートはここで決めた単価で受ける
export function OemProductsCard({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<OemItem[] | null>(null);
  const [minRate, setMinRate] = useState(25);
  const [adding, setAdding] = useState<"" | "new" | "copy">("");
  const [name, setName] = useState("");
  const [fromId, setFromId] = useState("");
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/contacts/${contactId}/oem`);
    if (!res.ok) return;
    const d = await res.json();
    setItems(d.items);
    setMinRate(d.settings.minMarginRate);
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (adding !== "copy" || products.length) return;
    fetch("/api/products?oem=exclude")
      .then((r) => (r.ok ? r.json() : []))
      .then((ps: ProductOpt[]) => setProducts(ps.filter((p) => p.active).sort(compareProductOrder)));
  }, [adding, products.length]);

  async function create() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/contacts/${contactId}/oem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adding === "copy" ? { fromProductId: fromId, name } : { name }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "作成できませんでした");
      return;
    }
    const { id } = await res.json();
    router.push(`/products/${id}`);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">
          OEM商品 <span className="text-sm font-normal text-gray-500">この顧客専用の商品</span>
        </CardTitle>
        {!adding && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAdding("copy")}>自社商品をコピーして作る</Button>
            <Button size="sm" onClick={() => setAdding("new")}><Plus className="size-4 mr-1" />新しく作る</Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-md border bg-gray-50 p-3 space-y-2 text-sm">
            {adding === "copy" && (
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="w-full border rounded-md px-2 py-2 bg-white">
                <option value="">コピー元の自社商品を選ぶ（原価の内訳ごとコピー）</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.code}）</option>)}
              </select>
            )}
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={adding === "copy" ? "商品名（空欄ならコピー元の名前＋顧客名）" : "商品名"}
              className="bg-white"
            />
            <p className="text-[11px] text-gray-500">作ったあと商品の画面で、原価（制作費・生地・資材）を整えてから見積を作ります。</p>
            {error && <p className="text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={create} disabled={saving || (adding === "copy" ? !fromId : !name.trim())}>{saving ? "作成中..." : "作る"}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(""); setError(""); }}>キャンセル</Button>
            </div>
          </div>
        )}

        {items === null ? (
          <p className="text-sm text-gray-400">読み込み中...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400">OEM商品はまだありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 border-b">
                <tr>
                  <th className="text-left py-1.5 pr-2">商品</th>
                  <th className="text-right py-1.5 px-2">単価</th>
                  <th className="text-right py-1.5 px-2">今の原価</th>
                  <th className="text-right py-1.5 px-2">粗利率</th>
                  <th className="text-right py-1.5 px-2">原価の変化</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((p) => (
                  <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                    <td className="py-1.5 pr-2">
                      <Link href={`/products/${p.id}`} className="text-blue-600 hover:underline font-medium">{p.name}</Link>
                      <span className="ml-1 font-mono text-[10px] text-gray-400">{p.code}</span>
                    </td>
                    <td className="text-right px-2 tabular-nums font-medium">
                      {p.price == null ? <span className="text-xs text-gray-400">未決定</span> : yen(p.price)}
                      {p.multiplier && <span className="block text-[10px] text-gray-400">×{p.multiplier}</span>}
                    </td>
                    <td className="text-right px-2 tabular-nums">{yen(p.cost.current)}</td>
                    <td className={`text-right px-2 tabular-nums ${p.belowMin ? "text-rose-600 font-medium" : ""}`}>
                      {p.belowMin && <AlertTriangle className="inline size-3.5 mr-0.5" />}
                      {p.marginRate == null ? "-" : `${p.marginRate}%`}
                    </td>
                    <td className={`text-right px-2 tabular-nums ${(p.costChange ?? 0) > 0 ? "text-amber-600" : "text-gray-500"}`}>
                      {p.costChange == null ? "-" : `${p.costChange > 0 ? "+" : ""}${p.costChange.toLocaleString()}円`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.some((p) => p.belowMin) && (
              <p className="mt-2 text-xs text-rose-600">粗利率が下限（{minRate}%）を下回っている商品があります。単価の見直しを相談するタイミングです。</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
