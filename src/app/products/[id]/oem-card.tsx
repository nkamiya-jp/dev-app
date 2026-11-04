"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { marginRate, multiplierFor, oemUnitPrice, type OemExtra, type OemSettings } from "@/lib/oem";

interface Quote {
  id: string;
  quantity: number;
  multiplier: number;
  includePackaging: boolean;
  unitCost: number;
  unitPrice: number;
  extras: OemExtra[];
  note: string | null;
  adopted: boolean;
  createdBy: string | null;
  createdAt: string;
}

interface OemData {
  settings: OemSettings;
  owner: { id: string; name: string; company: string | null } | null;
  includePackaging: boolean;
  cost: { current: number; total: number; packagingMaterial: number };
  price: number | null;
  pricedCost: number | null;
  pricedAt: string | null;
  multiplier: number | null;
  marginRate: number | null;
  costChange: number | null;
  belowMin: boolean;
  quotes: Quote[];
}

const yen = (n: number | null | undefined) => (n == null ? "-" : `${n.toLocaleString()}円`);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });

// OEM商品（顧客専用の商品）の単価：原価 × 倍率。普段の注文量で倍率を決めて固定し、リピートはその単価で受ける
// costKey：原価の入力が変わったら読み直すための値
export function OemCard({ productId, costKey }: { productId: string; costKey: string }) {
  const [data, setData] = useState<OemData | null>(null);
  const [qty, setQty] = useState("");
  const [mult, setMult] = useState("");
  const [incPack, setIncPack] = useState<boolean | null>(null);
  const [extras, setExtras] = useState<OemExtra[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // 決めた単価を直接変更する（交渉で決まった額など）
  const [editPrice, setEditPrice] = useState<string | null>(null);
  const [priceNote, setPriceNote] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/products/${productId}/oem`);
    if (res.ok) setData(await res.json());
  }, [productId]);

  useEffect(() => {
    load();
  }, [load, costKey]);

  if (!data) return null;
  const s = data.settings;
  const includePackaging = incPack ?? data.includePackaging;
  const unitCost = includePackaging ? data.cost.total : data.cost.total - data.cost.packagingMaterial;
  const quantity = Math.round(Number(qty)) || 0;
  const autoMult = quantity ? multiplierFor(quantity, s) : s.standardMultiplier;
  const multiplier = Number(mult) > 0 ? Number(mult) : autoMult;
  const unitPrice = oemUnitPrice(unitCost, multiplier);
  const rate = marginRate(unitPrice, unitCost);
  const extrasTotal = extras.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const ownerName = data.owner ? data.owner.company || data.owner.name : "";

  async function saveQuote() {
    if (!quantity) {
      setError("普段の注文量（数量）を入れてください");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/products/${productId}/oem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity, multiplier, includePackaging, extras, note }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "保存できませんでした");
      return;
    }
    setQty("");
    setMult("");
    setExtras([]);
    setNote("");
    load();
  }

  async function changePrice() {
    const price = Math.round(Number(editPrice));
    if (!price) return;
    const res = await fetch(`/api/products/${productId}/oem`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price, note: priceNote }),
    });
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error || "変更できませんでした");
      return;
    }
    setEditPrice(null);
    setPriceNote("");
    load();
  }

  async function adopt(q: Quote) {
    if (!confirm(`この見積の単価 ${q.unitPrice.toLocaleString()}円 で決めますか？\n${ownerName} の顧客別価格にも入り、リピートの受注で自動で入ります。`)) return;
    const res = await fetch(`/api/products/${productId}/oem/adopt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId: q.id }),
    });
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error || "決定できませんでした");
      return;
    }
    load();
  }

  async function remove(q: Quote) {
    if (!confirm("この見積を削除しますか？")) return;
    const res = await fetch(`/api/oem/quotes/${q.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error || "削除できませんでした");
      return;
    }
    load();
  }

  return (
    <Card className="bg-white shadow-sm border-violet-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">
          OEM単価
          {data.owner && (
            <Link href={`/contacts/${data.owner.id}`} className="ml-2 text-sm font-normal text-violet-700 hover:underline">
              {ownerName} 専用
            </Link>
          )}
        </CardTitle>
        <p className="text-xs text-gray-500">
          単価 ＝ 原価（制作費・販管費込み{data.includePackaging ? "・梱包資材込み" : "・梱包資材は除く"}）× 倍率。
          倍率は普段の注文量で決めて固定（{s.bulkQuantity.toLocaleString()}個以上 ×{s.bulkMultiplier}、それ未満 ×{s.standardMultiplier}）。10円単位に切り上げ。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 決めた単価と、今の原価での粗利 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[11px] text-gray-500">決めた単価</p>
            <p className="text-xl font-bold">{yen(data.price)}</p>
            {data.pricedAt && <p className="text-[11px] text-gray-400">{fmtDate(data.pricedAt)}・×{data.multiplier}</p>}
            {data.price != null && editPrice === null && (
              <button type="button" onClick={() => setEditPrice(String(data.price))} className="text-xs text-blue-600">変更</button>
            )}
          </div>
          <div>
            <p className="text-[11px] text-gray-500">今の原価</p>
            <p className="text-xl font-bold">{yen(data.cost.current)}</p>
            {!data.includePackaging && data.cost.packagingMaterial > 0 && (
              <p className="text-[11px] text-gray-400">梱包資材 {yen(data.cost.packagingMaterial)} は除く</p>
            )}
          </div>
          <div>
            <p className="text-[11px] text-gray-500">粗利率（今の原価で）</p>
            <p className={`text-xl font-bold ${data.belowMin ? "text-rose-600" : ""}`}>{data.marginRate == null ? "-" : `${data.marginRate}%`}</p>
            <p className="text-[11px] text-gray-400">下限 {s.minMarginRate}%</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500">決めた時からの原価の変化</p>
            <p className={`text-xl font-bold ${(data.costChange ?? 0) > 0 ? "text-amber-600" : ""}`}>
              {data.costChange == null ? "-" : `${data.costChange > 0 ? "+" : ""}${data.costChange.toLocaleString()}円`}
            </p>
            {data.pricedCost != null && <p className="text-[11px] text-gray-400">決めた時 {yen(data.pricedCost)}</p>}
          </div>
        </div>
        {editPrice !== null && (
          <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3 space-y-2 text-sm">
            <p className="font-medium">単価を変更</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="w-32 bg-white"
                autoFocus
              />
              <span>円</span>
              {Number(editPrice) > 0 && (
                <span className={`text-xs ${(marginRate(Number(editPrice), data.cost.current) ?? 0) < s.minMarginRate ? "text-rose-600" : "text-gray-600"}`}>
                  今の原価 {yen(data.cost.current)} で 粗利率 {marginRate(Number(editPrice), data.cost.current)}%・×
                  {data.cost.current > 0 ? Math.round((Number(editPrice) / data.cost.current) * 100) / 100 : "-"}
                </span>
              )}
            </div>
            <Input value={priceNote} onChange={(e) => setPriceNote(e.target.value)} placeholder="変更の理由（例：交渉で決定、原価の値上がり分を反映）" className="bg-white" />
            <p className="text-[11px] text-gray-500">変更すると、この顧客の顧客別価格も更新され、次の受注からこの単価で入ります。変更は見積の履歴にも残ります。</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={changePrice} disabled={!(Number(editPrice) > 0)}>この単価に変更</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditPrice(null); setPriceNote(""); }}>キャンセル</Button>
            </div>
          </div>
        )}
        {data.belowMin && (
          <p className="flex items-center gap-1.5 rounded bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
            <AlertTriangle className="size-4 shrink-0" />
            原価が上がって、粗利率が下限（{s.minMarginRate}%）を下回っています。単価の見直しを相談するタイミングです。
          </p>
        )}
        {data.price == null && (
          <p className="text-sm text-gray-500">まだ単価が決まっていません。下で見積を作り、「この単価で決定」を押してください。</p>
        )}

        {/* 見積を作る */}
        <div className="rounded-md border bg-gray-50 p-3 space-y-3">
          <p className="text-sm font-medium">見積を作る</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
            <div>
              <label className="text-[11px] text-gray-500">普段の注文量（個）</label>
              <Input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="例：300" className="bg-white" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">倍率（空欄＝自動 ×{autoMult}）</label>
              <Input value={mult} onChange={(e) => setMult(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={String(autoMult)} className="bg-white" />
            </div>
            <label className="flex items-center gap-1.5 text-sm pb-2 col-span-2">
              <input type="checkbox" checked={includePackaging} onChange={(e) => setIncPack(e.target.checked)} className="size-4" />
              梱包資材を原価に含める（こちらで用意する場合）
            </label>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] text-gray-500">別途（サンプル代・専用生地のロット・型や版の代金・送料など）</p>
            {extras.map((x, i) => (
              <div key={i} className="flex gap-2">
                <Input value={x.label} onChange={(e) => setExtras((a) => a.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} placeholder="項目" className="bg-white" />
                <Input
                  value={x.amount ? String(x.amount) : ""}
                  onChange={(e) => setExtras((a) => a.map((y, j) => (j === i ? { ...y, amount: Number(e.target.value.replace(/[^\d]/g, "")) || 0 } : y)))}
                  inputMode="numeric"
                  placeholder="金額"
                  className="bg-white w-32"
                />
                <button type="button" onClick={() => setExtras((a) => a.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600 px-1">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setExtras((a) => [...a, { label: "", amount: 0 }])} className="text-xs text-blue-600 inline-flex items-center gap-0.5">
              <Plus className="size-3.5" /> 別途の行を追加
            </button>
          </div>

          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="メモ（任意）" className="bg-white" />

          <div className="rounded bg-white border px-3 py-2 text-sm flex flex-wrap gap-x-6 gap-y-1">
            <span>原価 {yen(unitCost)} × {multiplier} ＝ <b className="text-base">単価 {yen(unitPrice)}</b></span>
            <span className={rate !== null && rate < s.minMarginRate ? "text-rose-600" : "text-gray-600"}>粗利率 {rate ?? "-"}%</span>
            {quantity > 0 && (
              <span className="text-gray-600">
                {quantity.toLocaleString()}個で {yen(unitPrice * quantity)}
                {extrasTotal > 0 && `＋別途 ${yen(extrasTotal)}`}
              </span>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <Button size="sm" onClick={saveQuote} disabled={saving}>{saving ? "保存中..." : "見積を保存"}</Button>
          </div>
        </div>

        {/* 見積の履歴 */}
        {data.quotes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 border-b">
                <tr>
                  <th className="text-left py-1.5 pr-2">日付</th>
                  <th className="text-right py-1.5 px-2">数量</th>
                  <th className="text-right py-1.5 px-2">倍率</th>
                  <th className="text-right py-1.5 px-2">原価</th>
                  <th className="text-right py-1.5 px-2">単価</th>
                  <th className="text-right py-1.5 px-2">粗利率</th>
                  <th className="text-left py-1.5 px-2">別途・メモ</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.quotes.map((q) => (
                  <tr key={q.id} className={q.adopted ? "bg-violet-50/60" : ""}>
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      {fmtDate(q.createdAt)}
                      {q.createdBy && <span className="block text-[10px] text-gray-400">{q.createdBy}</span>}
                    </td>
                    <td className="text-right px-2 tabular-nums">{q.quantity.toLocaleString()}</td>
                    <td className="text-right px-2 tabular-nums">×{q.multiplier}</td>
                    <td className="text-right px-2 tabular-nums">
                      {q.unitCost.toLocaleString()}
                      {q.includePackaging && <span className="block text-[10px] text-gray-400">梱包込み</span>}
                    </td>
                    <td className="text-right px-2 tabular-nums font-medium">{q.unitPrice.toLocaleString()}</td>
                    <td className="text-right px-2 tabular-nums">{marginRate(q.unitPrice, q.unitCost)}%</td>
                    <td className="px-2 text-xs text-gray-600">
                      {q.extras.map((x, i) => <span key={i} className="block">{x.label} {x.amount ? yen(x.amount) : ""}</span>)}
                      {q.note && <span className="block text-gray-400">{q.note}</span>}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {q.adopted ? (
                        <span className="text-xs rounded bg-violet-600 text-white px-2 py-0.5">決定</span>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => adopt(q)}>この単価で決定</Button>
                          <button type="button" onClick={() => remove(q)} className="text-gray-400 hover:text-red-600 p-1 ml-1" title="削除">
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// 商品の依頼主（OEM）を決める・外す。依頼主を決めると「その顧客専用の商品」になり、商品一覧・価格表から外れる
export function OemOwnerPicker({
  productId, owner, onChanged,
}: {
  productId: string;
  owner: { id: string; name: string; company: string | null } | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [sel, setSel] = useState(owner?.id || "");

  useEffect(() => {
    if (!open || contacts.length) return;
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : []))
      .then((cs: { id: string; name: string; company: string | null }[]) =>
        setContacts([...cs].sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name, "ja")))
      );
  }, [open, contacts.length]);

  async function save(ownerContactId: string | null) {
    const res = await fetch(`/api/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerContactId }),
    });
    if (!res.ok) {
      alert("保存できませんでした");
      return;
    }
    setOpen(false);
    onChanged();
  }

  if (!open) {
    return (
      <div className="text-sm">
        <p className="text-[11px] text-gray-400">OEM（依頼主）</p>
        <p className="font-medium">
          {owner ? owner.company || owner.name : <span className="text-gray-400 font-normal">自社商品</span>}
          <button type="button" onClick={() => setOpen(true)} className="ml-2 text-xs text-blue-600 font-normal">変更</button>
        </p>
      </div>
    );
  }
  return (
    <div className="text-sm space-y-1">
      <p className="text-[11px] text-gray-400">OEM（依頼主）</p>
      <select value={sel} onChange={(e) => setSel(e.target.value)} className="w-full border rounded-md px-2 py-1.5 bg-white">
        <option value="">自社商品（依頼主なし）</option>
        {contacts.map((c) => <option key={c.id} value={c.id}>{c.company ? `${c.company}（${c.name}）` : c.name}</option>)}
      </select>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => save(sel || null)}>保存</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>キャンセル</Button>
      </div>
      <p className="text-[11px] text-gray-400">依頼主を決めると、その顧客専用の商品になり、商品一覧・価格表・原価比較には出なくなります。</p>
    </div>
  );
}
