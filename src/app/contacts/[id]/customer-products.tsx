"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Package, FileText, Save, TrendingUp, Check } from "lucide-react";
import { compareProductOrder } from "@/lib/product-meta";
import { roundSellPrice, formatSellPrice } from "@/lib/pricing";
import { parseTypeRates, getDefaultRate, getContactTypeLabel } from "@/lib/contact-meta";

interface Product {
  id: string;
  code: string;
  name: string;
  series: string | null;
  retailPrice: number | null;
  typeRates: string | null;
  sortOrder: number;
  active: boolean;
}

type Entry = { price: number | null; note: string | null };

interface SnapshotSummary {
  id: string;
  name: string;
  note: string | null;
  snappedAt: string;
  _count?: { items: number };
}

// 顧客の取扱商品＋個別卸価格を編集するカード（価格表の顧客別ビューと同じデータ）
export function CustomerProductsCard({
  contactId,
  rate,
  contactType,
}: {
  contactId: string;
  rate: number | null;
  contactType: string | null;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [loading, setLoading] = useState(true);
  // 価格改定：新価格の下書き（productId → 新価格）。確定するまで卸価格は変わらない
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [revising, setRevising] = useState(false);
  const [snaps, setSnaps] = useState<SnapshotSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; href?: string; error?: boolean } | null>(null);

  const loadSnaps = useCallback(async () => {
    const res = await fetch(`/api/price-list/snapshots?contactId=${contactId}`);
    if (res.ok) {
      const d = await res.json();
      setSnaps(Array.isArray(d) ? d : []);
    }
  }, [contactId]);

  const load = useCallback(async () => {
    const [ps, cps, rv] = await Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch(`/api/customer-prices?contactId=${contactId}`).then((r) => r.json()),
      fetch(`/api/customer-prices/revision?contactId=${contactId}`).then((r) => (r.ok ? r.json() : null)),
    ]);
    const dp = (rv?.prices ?? {}) as Record<string, number>;
    setDraft(dp);
    if (Object.keys(dp).length > 0) setRevising(true);
    // OEM商品は依頼主のこの顧客の分だけ
    setProducts(Array.isArray(ps) ? ps.filter((p: Product & { ownerContactId?: string | null }) => p.active && (!p.ownerContactId || p.ownerContactId === contactId)) : []);
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
    loadSnaps();
  }, [load, loadSnaps]);

  async function putDraft(body: Record<string, unknown>) {
    const res = await fetch("/api/customer-prices/revision", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, ...body }),
    });
    if (!res.ok) {
      setMsg({ text: "新価格の保存に失敗しました。もう一度入れてください", error: true });
      return;
    }
    const d = await res.json();
    setDraft(d.prices ?? {});
  }

  function setNewPrice(productId: string, price: number | null) {
    setDraft((p) => {
      const n = { ...p };
      if (price != null && price > 0) n[productId] = price;
      else delete n[productId];
      return n;
    });
    putDraft({ productId, price });
  }

  // いまの価格表を保存（PDFの元になる控え）
  async function saveSnapshot() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/price-list/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "customer", contactId, stage: "current" }),
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setMsg({ text: `保存できませんでした${e.error ? `（${e.error}）` : ""}`, error: true });
      return;
    }
    const d = await res.json();
    setMsg({ text: `いまの価格表を保存しました（${d.itemCount}商品）`, href: `/price-list/snapshots/${d.snapshot.id}?print=1` });
    loadSnaps();
  }

  async function confirmRevision(changeCount: number) {
    if (!window.confirm(`${changeCount}商品の卸価格を新価格に変えます。\n改定前と改定後の価格表を履歴に保存します。よろしいですか？`)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/customer-prices/revision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId }),
    });
    setBusy(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setMsg({ text: `確定できませんでした${e.error ? `（${e.error}）` : ""}`, error: true });
      return;
    }
    const d = await res.json();
    setRevising(false);
    setMsg({ text: `新価格で確定しました（${d.changed}商品）。改定後の価格表を保存しました`, href: `/price-list/snapshots/${d.afterId}?print=1` });
    await load();
    loadSnaps();
  }

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

  function priceOf(p: Product) {
    const e = entries[p.id];
    const itemRate = (contactType ? parseTypeRates(p.typeRates)[contactType] : undefined) ?? rate;
    const autoRaw = itemRate != null && p.retailPrice ? (p.retailPrice * itemRate) / 100 : 0;
    const auto = roundSellPrice(autoRaw);
    const override = e?.price ?? null;
    // カテゴリの標準価格（顧客ごとの掛率は使わず、カテゴリの既定掛率／商品×カテゴリの掛率）
    const baseRate = (contactType ? parseTypeRates(p.typeRates)[contactType] : undefined) ?? getDefaultRate(contactType);
    const baseRaw = baseRate != null && p.retailPrice ? (p.retailPrice * baseRate) / 100 : 0;
    const base = roundSellPrice(baseRaw);
    return { auto, autoRaw, override, current: override ?? auto, base, baseRaw, baseRate };
  }

  // 新価格が入っていて、いまと違う商品
  const changed = handled.filter((p) => draft[p.id] != null && draft[p.id] !== priceOf(p).current);
  const sumCur = changed.reduce((a, p) => a + priceOf(p).current, 0);
  const sumNew = changed.reduce((a, p) => a + draft[p.id], 0);

  function fillWithAuto() {
    const next: Record<string, number> = { ...draft };
    for (const p of handled) {
      const { auto } = priceOf(p);
      if (auto > 0 && next[p.id] == null) next[p.id] = auto;
    }
    setDraft(next);
    putDraft({ prices: next });
  }

  function clearDraft() {
    if (!window.confirm("入れた新価格をすべて消します。よろしいですか？")) return;
    setDraft({});
    putDraft({ prices: {} });
  }

  const yen = (n: number) => `${n.toLocaleString()}円`;

  // 標準（カテゴリの掛率）との比較：問屋なら最新の問屋価格と並べる
  const typeLabel = contactType ? getContactTypeLabel(contactType) : "";
  const baseHeader = contactType?.startsWith("wholesale")
    ? `${typeLabel}価格（最新）`
    : `標準${typeLabel ? `（${typeLabel}）` : ""}`;
  const cheaper = handled
    .map((p) => priceOf(p))
    .filter((x) => x.base > 0 && x.current > 0 && x.current < x.base)
    .map((x) => (x.current - x.base) / x.base);
  const avgCheaper = cheaper.length > 0 ? (cheaper.reduce((a, b) => a + b, 0) / cheaper.length) * 100 : 0;
  const maxCheaper = cheaper.length > 0 ? Math.min(...cheaper) * 100 : 0;

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="size-5" />
          取扱商品
          <span className="text-sm font-normal text-gray-500">{handled.length}件</span>
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={saveSnapshot}
            disabled={busy || loading || handled.length === 0}
            className="text-xs border rounded-md px-2 py-1 flex items-center gap-1 hover:bg-gray-50 disabled:opacity-50"
            title="いまの卸価格の価格表を履歴に保存します（PDFにできます）"
          >
            <Save className="size-3.5" /> いまの価格表を保存
          </button>
          <button
            onClick={() => setRevising((v) => !v)}
            className={`text-xs border rounded-md px-2 py-1 flex items-center gap-1 ${revising ? "bg-amber-100 border-amber-300 text-amber-800" : "hover:bg-gray-50"}`}
          >
            <TrendingUp className="size-3.5" /> 価格改定{revising ? "中" : ""}
          </button>
          <Link href="/price-list" className="text-xs text-blue-600 hover:underline">
            価格表で見る →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {msg && (
          <div className={`text-sm rounded-md px-3 py-2 ${msg.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>
            {msg.text}
            {msg.href && (
              <Link href={msg.href} target="_blank" className="ml-2 text-blue-600 hover:underline">
                PDFを開く →
              </Link>
            )}
          </div>
        )}

        {revising && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm space-y-2">
            <p className="text-amber-900">
              「新価格」に改定後の卸価格を入れてください。確定するまで、いまの卸価格（受注に入る価格）は変わりません。
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={fillWithAuto} disabled={loading} className="text-xs border border-amber-300 bg-white rounded px-2 py-1 hover:bg-amber-100">
                空欄を 上代×掛率 で埋める
              </button>
              <button onClick={clearDraft} disabled={Object.keys(draft).length === 0} className="text-xs border border-amber-300 bg-white rounded px-2 py-1 hover:bg-amber-100 disabled:opacity-50">
                新価格を全部消す
              </button>
              <span className="text-xs text-amber-900">
                変わる商品 {changed.length}件
                {changed.length > 0 && sumCur > 0 && (
                  <>（合計 {yen(sumCur)} → {yen(sumNew)}、{sumNew >= sumCur ? "+" : ""}{(((sumNew - sumCur) / sumCur) * 100).toFixed(1)}%）</>
                )}
              </span>
              <button
                onClick={() => confirmRevision(changed.length)}
                disabled={busy || changed.length === 0}
                className="ml-auto text-xs rounded px-3 py-1 bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1"
              >
                <Check className="size-3.5" /> 新価格で確定
              </button>
            </div>
          </div>
        )}

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
          {cheaper.length > 0 && (
            <span className="text-xs rounded bg-red-50 text-red-700 px-2 py-1 font-medium">
              {baseHeader}より安い商品 {cheaper.length}件（平均 {avgCheaper.toFixed(1)}%、最大 {maxCheaper.toFixed(1)}%）
            </span>
          )}
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
                  <th className="text-right px-2 py-1.5 font-medium text-gray-500 w-28 whitespace-nowrap" title="顧客カテゴリの標準の掛率で出した価格（上代×掛率、20円単位に切り上げ）">
                    {baseHeader}
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium text-gray-700 w-28 whitespace-nowrap">{revising ? "いまの卸価格" : "卸価格"}</th>
                  <th className="text-right px-2 py-1.5 font-medium text-gray-500 w-24 whitespace-nowrap" title="卸価格 − 標準">{contactType?.startsWith("wholesale") ? `${typeLabel}価格との差` : "標準との差"}</th>
                  {revising && (
                    <>
                      <th className="text-right px-2 py-1.5 font-medium text-amber-800 w-28 whitespace-nowrap bg-amber-50">新価格</th>
                      <th className="text-right px-2 py-1.5 font-medium text-gray-500 w-24 whitespace-nowrap">差</th>
                    </>
                  )}
                  <th className="text-left px-2 py-1.5 font-medium text-gray-500 min-w-[130px]">メモ（理由）</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {handled.map((p) => {
                  const e = entries[p.id];
                  const { auto, autoRaw, override, current, base, baseRaw, baseRate } = priceOf(p);
                  const vsBase = base > 0 && current > 0 ? current - base : null;
                  const np = draft[p.id] ?? null;
                  const diff = np != null ? np - current : null;
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
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        {base > 0 ? (
                          <>
                            <div className="text-gray-600">{formatSellPrice(base, baseRaw, "円")}</div>
                            <div className="text-[10px] mt-0.5">
                              <span className="text-gray-400">{baseRate}%</span>
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
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
                      <td className={`px-2 py-1.5 text-right whitespace-nowrap ${vsBase != null && vsBase < 0 ? "bg-red-50" : ""}`}>
                        {vsBase == null ? (
                          <span className="text-gray-300">-</span>
                        ) : vsBase === 0 ? (
                          <span className="text-gray-300 text-xs">±0</span>
                        ) : (
                          <div className={vsBase < 0 ? "text-red-600 font-bold" : "text-gray-500"}>
                            <div>{vsBase > 0 ? "+" : ""}{vsBase.toLocaleString()}円</div>
                            <div className="text-[11px]">{vsBase > 0 ? "+" : ""}{((vsBase / base) * 100).toFixed(1)}%</div>
                          </div>
                        )}
                      </td>
                      {revising && (
                        <>
                          <td className="px-2 py-1.5 text-right bg-amber-50/50">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                key={`n_${p.id}_${np ?? ""}`}
                                type="text"
                                inputMode="numeric"
                                defaultValue={np ?? ""}
                                placeholder={current > 0 ? current.toLocaleString() : ""}
                                onBlur={(ev) => {
                                  const raw = ev.target.value.replace(/[^\d]/g, "");
                                  const val = raw === "" ? null : parseInt(raw, 10);
                                  if (val === np) return;
                                  setNewPrice(p.id, val);
                                }}
                                onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                                className="w-16 text-right border border-amber-300 rounded px-1 py-0.5 font-medium bg-white"
                              />
                              <span className="text-gray-400 text-xs">円</span>
                            </div>
                            {auto > 0 && (
                              <div className="text-[10px] text-right mt-0.5 text-gray-400 whitespace-nowrap" title="上代×掛率（20円単位に切り上げ／カッコ内は実数値）">
                                計算 {formatSellPrice(auto, autoRaw)}
                              </div>
                            )}
                          </td>
                          <td className={`px-2 py-1.5 text-right whitespace-nowrap text-xs ${diff == null || diff === 0 ? "text-gray-300" : diff > 0 ? "text-red-600" : "text-blue-600"}`}>
                            {diff == null ? "-" : diff === 0 ? "±0" : (
                              <>
                                {diff > 0 ? "+" : ""}{diff.toLocaleString()}円
                                {current > 0 && <div className="text-[10px]">{diff > 0 ? "+" : ""}{((diff / current) * 100).toFixed(1)}%</div>}
                              </>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-2 py-1.5">
                        <input
                          key={`m_${p.id}_${e?.note ?? ""}`}
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

    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="size-5" />
          価格表の履歴
          <span className="text-sm font-normal text-gray-500">{snaps.length}件</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {snaps.length === 0 ? (
          <p className="text-sm text-gray-400 py-3 text-center">
            まだありません。「いまの価格表を保存」で、いまの卸価格の価格表を残せます
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {snaps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 py-2 flex-wrap">
                <span className="text-gray-500 w-24 shrink-0">
                  {new Date(s.snappedAt).toLocaleDateString("ja-JP")}
                </span>
                <Link href={`/price-list/snapshots/${s.id}`} className="text-blue-600 hover:underline flex-1 min-w-[200px]">
                  {s.name}
                </Link>
                {i === 0 && <span className="text-[10px] rounded bg-green-100 text-green-700 px-1.5 py-0.5">最新</span>}
                <span className="text-xs text-gray-400">{s._count?.items ?? 0}商品</span>
                <Link
                  href={`/price-list/snapshots/${s.id}?print=1`}
                  target="_blank"
                  className="text-xs border rounded px-2 py-0.5 hover:bg-gray-50 flex items-center gap-1"
                >
                  <FileText className="size-3.5" /> PDF
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
    </>
  );
}
