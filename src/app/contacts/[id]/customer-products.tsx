"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Package } from "lucide-react";
import { compareProductOrder } from "@/lib/product-meta";

interface Product {
  id: string;
  code: string;
  name: string;
  series: string | null;
  retailPrice: number | null;
  sortOrder: number;
  active: boolean;
}

type Entry = { price: number | null; note: string | null };

// 顧客の取扱商品＋個別卸価格を編集するカード（価格表の顧客別ビューと同じデータ）
export function CustomerProductsCard({
  contactId,
  rate,
}: {
  contactId: string;
  rate: number | null;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [ps, cps] = await Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch(`/api/customer-prices?contactId=${contactId}`).then((r) => r.json()),
    ]);
    setProducts(Array.isArray(ps) ? ps.filter((p: Product) => p.active) : []);
    const m: Record<string, Entry> = {};
    if (Array.isArray(cps)) {
      cps.forEach((x: { productId: string; price: number | null; note: string | null }) => {
        m[x.productId] = { price: x.price ?? null, note: x.note ?? null };
      });
    }
    setEntries(m);
    setLoading(false);
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(productId: string, patch: Partial<Entry>) {
    setEntries((p) => ({
      ...p,
      [productId]: { price: p[productId]?.price ?? null, note: p[productId]?.note ?? null, ...patch },
    }));
    await fetch("/api/customer-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, productId, ...patch }),
    });
  }

  async function add(productId: string) {
    setEntries((p) => ({ ...p, [productId]: { price: null, note: null } }));
    await fetch("/api/customer-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, productId }),
    });
  }

  async function remove(productId: string) {
    setEntries((p) => {
      const n = { ...p };
      delete n[productId];
      return n;
    });
    await fetch(`/api/customer-prices?contactId=${contactId}&productId=${productId}`, { method: "DELETE" });
  }

  // 商品マスタと同じ並び（シリーズ順→シリーズ内sortOrder）に統一
  const ordered = [...products].sort(compareProductOrder);
  const handled = ordered.filter((p) => p.id in entries);
  const addable = ordered.filter((p) => !(p.id in entries));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="size-5" />
          取扱商品
          <span className="text-sm font-normal text-gray-500">{handled.length}件</span>
        </CardTitle>
        <Link href="/price-list" className="text-xs text-blue-600 hover:underline">
          価格表で見る →
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value=""
            onChange={(e) => { if (e.target.value) add(e.target.value); }}
            className="border rounded-md px-2 py-1.5 text-sm min-w-[220px] bg-white"
            disabled={loading}
          >
            <option value="">＋ 商品を選んで追加...</option>
            {addable.map((p) => (
              <option key={p.id} value={p.id}>{p.name}（{p.code}）</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">
            掛率 {rate != null ? `${rate}%` : "未設定"}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 py-4 text-center">読み込み中...</p>
        ) : handled.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            取扱商品がありません。上から追加してください
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-500 min-w-[150px]">商品</th>
                  <th className="text-right px-2 py-1.5 font-medium text-gray-500 w-20 whitespace-nowrap">上代</th>
                  <th className="text-right px-2 py-1.5 font-medium text-gray-700 w-28 whitespace-nowrap">卸価格</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-500 min-w-[130px]">メモ（理由）</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {handled.map((p) => {
                  const e = entries[p.id];
                  const auto = rate != null && p.retailPrice ? Math.round((p.retailPrice * rate) / 100) : 0;
                  const override = e?.price ?? null;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5">
                        <Link href={`/products/${p.id}`} className="text-blue-600 hover:underline whitespace-nowrap">
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-500 whitespace-nowrap">
                        {p.retailPrice ? `${p.retailPrice.toLocaleString()}円` : "-"}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            key={`p_${p.id}_${override ?? ""}`}
                            type="text"
                            inputMode="numeric"
                            defaultValue={override ?? ""}
                            placeholder={auto > 0 ? auto.toLocaleString() : "0"}
                            onBlur={(ev) => {
                              const raw = ev.target.value.replace(/[^\d]/g, "");
                              const val = raw === "" ? null : parseInt(raw, 10);
                              if (val === override) return;
                              save(p.id, { price: val });
                            }}
                            onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                            className="w-16 text-right border rounded px-1 py-0.5 font-medium"
                          />
                          <span className="text-gray-400 text-xs">円</span>
                        </div>
                        <div className="text-[10px] text-right mt-0.5">
                          {override != null ? (
                            <button onClick={() => save(p.id, { price: null })} className="text-blue-600 hover:underline">
                              個別 · 自動に戻す
                            </button>
                          ) : (
                            <span className="text-gray-400">自動</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          key={`n_${p.id}_${e?.note ?? ""}`}
                          type="text"
                          defaultValue={e?.note ?? ""}
                          placeholder="例: 長年の取引先価格"
                          onBlur={(ev) => {
                            const v = ev.target.value.trim();
                            if (v === (e?.note ?? "")) return;
                            save(p.id, { note: v === "" ? null : v });
                          }}
                          onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                          className="w-full border rounded px-1.5 py-0.5 text-xs"
                        />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          onClick={() => remove(p.id)}
                          className="text-gray-300 hover:text-red-500"
                          title="取扱商品から削除"
                        >
                          <X className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
