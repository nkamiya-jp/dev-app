"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Copy, Plus, Star, Trash2 } from "lucide-react";
import { MonthAllocator } from "./month-allocator";

interface Row {
  key: string;
  channel: string;
  channelLabel: string;
  contactId: string | null;
  label: string;
  price: number;
  priceSource: string;
  sellCost: number;
  unitGross: number;
  qty: Record<string, number>;
}
interface Totals { produced: number; sold: number; revenue: number; sellCost: number; gross: number; productionCost: number; cash: number; stock: number; cumulativeCash: number }
interface View {
  plan: { id: string; name: string; term: string; note: string | null; adopted: boolean; openingStock: number };
  product: { id: string; code: string; name: string; retailPrice: number | null; cost: number; stock: number };
  months: string[];
  production: Record<string, number>;
  rows: Row[];
  channels: { id: string; label: string; ratePct: number | null; price: number; sellCost: number; unitGross: number; cost: { pct: number; perUnit: number } | null }[];
  result: {
    monthly: (Totals & { month: string })[];
    quarters: (Totals & { quarter: string })[];
    year: Totals;
    payback: string | null;
    lowestCash: number;
    stockShortMonth: string | null;
    rowTotals: { key: string; qty: number; revenue: number; gross: number }[];
    grossRate: number | null;
  };
}
interface ContactOpt { id: string; name: string; company: string | null; type: string | null }

const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;
const man = (n: number) => `${(Math.round(n / 1000) / 10).toLocaleString()}万`;
const mLabel = (ym: string) => `${Number(ym.slice(5, 7))}月`;
const SOURCE_LABEL: Record<string, string> = { individual: "顧客別価格", auto: "上代×掛率", standard: "標準卸価格", channel: "上代×掛率", none: "単価なし" };

// 月の列＋四半期の小計列の並び（3か月ごとに小計）
function columns(months: string[]) {
  const cols: ({ type: "m"; month: string } | { type: "q"; q: number })[] = [];
  months.forEach((m, i) => {
    cols.push({ type: "m", month: m });
    if (i % 3 === 2) cols.push({ type: "q", q: i / 3 });
  });
  return cols;
}

export default function SalesPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ channel: string; contactId: string | null; label: string; channelLabel: string }[]>([]);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [addChannel, setAddChannel] = useState("");
  const [addContact, setAddContact] = useState("");
  const [editName, setEditName] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sales-plans/${id}`);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "読み込めませんでした");
      return;
    }
    setView(await res.json());
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/contacts").then((r) => (r.ok ? r.json() : [])).then(setContacts);
  }, [load]);

  async function saveCells(cells: Record<string, unknown>[]) {
    const res = await fetch(`/api/sales-plans/${id}/cells`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cells }),
    });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error || "保存できませんでした");
    await load();
  }

  async function updatePlan(data: Record<string, unknown>) {
    const res = await fetch(`/api/sales-plans/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) alert("保存できませんでした");
    load();
  }

  async function duplicate() {
    const res = await fetch(`/api/sales-plans/${id}/duplicate`, { method: "POST" });
    if (!res.ok) return alert("コピーできませんでした");
    router.push(`/sales-plans/${(await res.json()).id}`);
  }

  async function removeRow(r: { channel: string; contactId: string | null }) {
    if (!confirm("この行（12か月分）を消しますか？")) return;
    setPending((p) => p.filter((x) => !(x.channel === r.channel && x.contactId === r.contactId)));
    const q = new URLSearchParams({ channel: r.channel, ...(r.contactId ? { contactId: r.contactId } : {}) });
    await fetch(`/api/sales-plans/${id}/cells?${q}`, { method: "DELETE" });
    load();
  }

  // 年の数を、月に均等に振る（端数は前の月から1個ずつ）
  function spread(kind: "production" | "sale", r?: { channel: string; contactId: string | null }) {
    if (!view) return;
    const s = prompt("年間の数を入れてください（12か月に均等に振ります）");
    const total = Math.round(Number(s));
    if (!total || total < 0) return;
    const base = Math.floor(total / 12);
    const extra = total - base * 12;
    saveCells(view.months.map((m, i) => ({ kind, channel: r?.channel, contactId: r?.contactId, month: m, qty: base + (i < extra ? 1 : 0) })));
  }

  function applyAllocation(month: string, qty: Record<string, number>) {
    if (!view) return;
    if (!confirm(`${Number(month.slice(5, 7))}月の「顧客未定」の行を、この振り分けで上書きしますか？`)) return;
    saveCells(view.channels.map((c) => ({ kind: "sale", channel: c.id, contactId: null, month, qty: qty[c.id] || 0 })));
  }

  function addRow(channel: string, contactId: string | null) {
    if (!view || !channel) return;
    const ch = view.channels.find((c) => c.id === channel);
    const c = contacts.find((x) => x.id === contactId);
    const key = `${channel}|${contactId ?? ""}`;
    if (view.rows.some((r) => r.key === key) || pending.some((p) => `${p.channel}|${p.contactId ?? ""}` === key)) return;
    setPending((p) => [...p, { channel, contactId, label: c ? c.company || c.name : "顧客未定", channelLabel: ch?.label || channel }]);
    setAddContact("");
  }

  if (error) return <div className="p-6 text-gray-500">{error}</div>;
  if (!view) return <div className="p-6 text-gray-400">読み込み中...</div>;

  const { result: res, months } = view;
  const cols = columns(months);
  const pendingRows: Row[] = pending
    .filter((p) => !view.rows.some((r) => r.key === `${p.channel}|${p.contactId ?? ""}`))
    .map((p) => {
      const ch = view.channels.find((c) => c.id === p.channel);
      return { key: `${p.channel}|${p.contactId ?? ""}`, channel: p.channel, channelLabel: p.channelLabel, contactId: p.contactId, label: p.label, price: ch?.price ?? 0, priceSource: "channel", sellCost: ch?.sellCost ?? 0, unitGross: ch?.unitGross ?? 0, qty: {} };
    });
  const rows = [...view.rows, ...pendingRows];
  const rankedChannels = [...view.channels].filter((c) => c.price > 0).sort((a, b) => b.unitGross - a.unitGross);
  const contactsForChannel = contacts.filter((c) => c.type === addChannel);
  const sumQ = (rec: Record<string, number>, q: number) => months.slice(q * 3, q * 3 + 3).reduce((a, m) => a + (rec[m] || 0), 0);
  const sumY = (rec: Record<string, number>) => months.reduce((a, m) => a + (rec[m] || 0), 0);

  // 計算結果の行（月・四半期・年）
  const resultRows: { label: string; get: (t: Totals) => number; fmt: (n: number) => string; strong?: boolean; danger?: boolean }[] = [
    { label: "販売数", get: (t) => t.sold, fmt: (n) => n.toLocaleString() },
    { label: "在庫（月末）", get: (t) => t.stock, fmt: (n) => n.toLocaleString(), danger: true },
    { label: "売上", get: (t) => t.revenue, fmt: man, strong: true },
    { label: "販売コスト", get: (t) => t.sellCost, fmt: man },
    { label: "粗利", get: (t) => t.gross, fmt: man, strong: true },
    { label: "生産の支払い", get: (t) => t.productionCost, fmt: man },
    { label: "その月の収支", get: (t) => t.cash, fmt: man, danger: true },
    { label: "収支の累計", get: (t) => t.cumulativeCash, fmt: man, strong: true, danger: true },
  ];

  return (
    <div className="space-y-4">
      <Link href="/sales-plans" className="text-gray-500 hover:text-gray-700 text-sm">← 販売計画</Link>

      {/* 見出し */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {editName !== null ? (
            <div className="flex gap-2">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-80" autoFocus />
              <Button size="sm" onClick={() => { updatePlan({ name: editName }); setEditName(null); }}>保存</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditName(null)}>キャンセル</Button>
            </div>
          ) : (
            <h2 className="text-2xl font-bold cursor-pointer" onClick={() => setEditName(view.plan.name)} title="押すと名前を変えられます">
              {view.plan.name}
            </h2>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {view.plan.term}・
            <Link href={`/products/${view.product.id}`} className="text-blue-600 hover:underline">{view.product.name}</Link>
            ・原価 {yen(view.product.cost)}{view.product.retailPrice ? `・上代 ${yen(view.product.retailPrice)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={view.plan.adopted ? "default" : "outline"} onClick={() => updatePlan({ adopted: !view.plan.adopted })}>
            <Star className="size-4 mr-1" /> {view.plan.adopted ? "採用中" : "この案を採用"}
          </Button>
          <Button size="sm" variant="outline" onClick={duplicate}><Copy className="size-4 mr-1" /> コピーして別案</Button>
        </div>
      </div>
      {view.plan.adopted && <p className="text-xs text-gray-500">採用中の案は「顧客予算」に入ります（同じ商品・同じ期で採用できるのは1案だけ）。</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">期首の在庫（すでに作ってある分）</span>
        <QtyCell value={view.plan.openingStock} onSave={(q) => updatePlan({ openingStock: q })} />
        <span className="text-gray-500">個</span>
        {view.product.stock > 0 && view.plan.openingStock !== view.product.stock && (
          <button type="button" onClick={() => updatePlan({ openingStock: view.product.stock })} className="text-xs text-blue-600">
            今の在庫（{view.product.stock.toLocaleString()}個）を入れる
          </button>
        )}
        <span className="text-[11px] text-gray-400">在庫には入りますが、支払いは済んでいるので資金は出ていきません</span>
      </div>

      {/* 年の結果 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "生産 → 販売", value: `${res.year.produced.toLocaleString()} → ${res.year.sold.toLocaleString()}個`, sub: `期末の在庫 ${res.year.stock.toLocaleString()}個` },
          { label: "売上", value: man(res.year.revenue) + "円", sub: `販売コスト ${man(res.year.sellCost)}円` },
          { label: "粗利", value: man(res.year.gross) + "円", sub: res.grossRate == null ? "" : `粗利率 ${res.grossRate}%` },
          { label: "いちばん深いマイナス", value: man(res.lowestCash) + "円", sub: "生産の支払いが先に出ていく分", danger: res.lowestCash < 0 },
          { label: "回収月", value: res.payback ? mLabel(res.payback) : res.year.cumulativeCash < 0 ? "期内に回収できない" : "-", sub: `期末の累計 ${man(res.year.cumulativeCash)}円`, danger: !res.payback && res.year.cumulativeCash < 0 },
        ].map((k) => (
          <Card key={k.label} className="bg-white shadow-sm">
            <CardContent className="py-3">
              <p className="text-[11px] text-gray-500">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.danger ? "text-rose-600" : ""}`}>{k.value}</p>
              <p className="text-[11px] text-gray-400">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {res.stockShortMonth && (
        <p className="flex items-center gap-1.5 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="size-4" /> {mLabel(res.stockShortMonth)}に、作った数より多く売る計画になっています（在庫がマイナス）。生産を前の月に足してください。
        </p>
      )}

      <MonthAllocator
        months={months}
        channels={view.channels}
        rows={view.rows}
        monthEndStock={Object.fromEntries(res.monthly.map((m) => [m.month, m.stock]))}
        production={view.production}
        openingStock={view.plan.openingStock}
        defaultMonth={months.find((m) => m >= new Date().toISOString().slice(0, 7)) || months[0]}
        onApply={applyAllocation}
      />

      {/* 月ごとの表 */}
      <Card className="bg-white shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="text-sm min-w-max">
            <thead className="bg-gray-50 border-b text-xs text-gray-500">
              <tr>
                <th className="text-left px-2 py-2 sticky left-0 bg-gray-50 z-10 min-w-[220px]">行</th>
                <th className="text-right px-2 py-2">単価</th>
                <th className="text-right px-2 py-2">1個の粗利</th>
                {cols.map((c) =>
                  c.type === "m" ? (
                    <th key={c.month} className="text-right px-1 py-2 w-16">{mLabel(c.month)}</th>
                  ) : (
                    <th key={`q${c.q}`} className="text-right px-2 py-2 bg-gray-100">{c.q + 1}Q</th>
                  )
                )}
                <th className="text-right px-2 py-2 bg-gray-100">年計</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {/* 生産 */}
              <tr className="bg-sky-50/40">
                <td className="px-2 py-1 sticky left-0 bg-sky-50 z-10 font-medium">
                  生産（個）
                  <button type="button" onClick={() => spread("production")} className="ml-2 text-[11px] text-blue-600 font-normal">均等に振る</button>
                </td>
                <td className="text-right px-2 text-xs text-gray-500">原価 {view.product.cost.toLocaleString()}</td>
                <td />
                {cols.map((c) =>
                  c.type === "m" ? (
                    <td key={c.month} className="px-1 py-1">
                      <QtyCell value={view.production[c.month] || 0} onSave={(q) => saveCells([{ kind: "production", month: c.month, qty: q }])} />
                    </td>
                  ) : (
                    <td key={`q${c.q}`} className="text-right px-2 bg-gray-50 tabular-nums">{sumQ(view.production, c.q).toLocaleString()}</td>
                  )
                )}
                <td className="text-right px-2 bg-gray-50 font-medium tabular-nums">{sumY(view.production).toLocaleString()}</td>
                <td />
              </tr>

              {/* 販売（カテゴリ・顧客） */}
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="px-2 py-1 sticky left-0 bg-white z-10">
                    <span className="text-[10px] rounded bg-gray-100 px-1.5 py-0.5 mr-1">{r.channelLabel}</span>
                    <span className={r.contactId ? "font-medium" : "text-gray-500"}>{r.label}</span>
                    <button type="button" onClick={() => spread("sale", r)} className="ml-2 text-[11px] text-blue-600">均等に振る</button>
                  </td>
                  <td className="text-right px-2 tabular-nums" title={SOURCE_LABEL[r.priceSource]}>
                    {r.price.toLocaleString()}
                    {r.sellCost > 0 && <span className="block text-[10px] text-gray-400">販売コスト {r.sellCost.toLocaleString()}</span>}
                  </td>
                  <td className={`text-right px-2 tabular-nums ${r.unitGross < 0 ? "text-rose-600" : ""}`}>{r.unitGross.toLocaleString()}</td>
                  {cols.map((c) =>
                    c.type === "m" ? (
                      <td key={c.month} className="px-1 py-1">
                        <QtyCell value={r.qty[c.month] || 0} onSave={(q) => saveCells([{ kind: "sale", channel: r.channel, contactId: r.contactId, month: c.month, qty: q }])} />
                      </td>
                    ) : (
                      <td key={`q${c.q}`} className="text-right px-2 bg-gray-50 tabular-nums">{sumQ(r.qty, c.q).toLocaleString()}</td>
                    )
                  )}
                  <td className="text-right px-2 bg-gray-50 tabular-nums">
                    <span className="font-medium">{sumY(r.qty).toLocaleString()}</span>
                    <span className="block text-[10px] text-gray-400">{man(sumY(r.qty) * r.price)}円</span>
                  </td>
                  <td className="px-1">
                    <button type="button" onClick={() => removeRow(r)} className="text-gray-300 hover:text-red-600 p-1" title="この行を消す">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {/* 行を足す */}
              <tr>
                <td colSpan={cols.length + 5} className="px-2 py-2 bg-gray-50/50">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <select value={addChannel} onChange={(e) => { setAddChannel(e.target.value); setAddContact(""); }} className="border rounded-md px-2 py-1.5 bg-white">
                      <option value="">顧客カテゴリを選ぶ</option>
                      {view.channels.map((c) => <option key={c.id} value={c.id}>{c.label}（{c.ratePct ?? "-"}%）</option>)}
                    </select>
                    {addChannel && (
                      <select value={addContact} onChange={(e) => setAddContact(e.target.value)} className="border rounded-md px-2 py-1.5 bg-white">
                        <option value="">顧客未定（カテゴリでまとめて）</option>
                        {contactsForChannel.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                      </select>
                    )}
                    <Button size="sm" variant="outline" disabled={!addChannel} onClick={() => addRow(addChannel, addContact || null)}>
                      <Plus className="size-4 mr-1" /> 行を追加
                    </Button>
                    {addChannel && contactsForChannel.length === 0 && <span className="text-xs text-gray-400">このカテゴリの顧客はまだいません（顧客の「取引タイプ」で決まります）</span>}
                  </div>
                </td>
              </tr>

              {/* 計算結果 */}
              {resultRows.map((rr) => (
                <tr key={rr.label} className={`bg-gray-50/70 ${rr.strong ? "font-medium" : ""}`}>
                  <td className="px-2 py-1 sticky left-0 bg-gray-50 z-10 text-xs">{rr.label}</td>
                  <td />
                  <td />
                  {cols.map((c) => {
                    const t = c.type === "m" ? res.monthly.find((x) => x.month === c.month)! : res.quarters[c.q];
                    const n = rr.get(t);
                    const isPayback = c.type === "m" && rr.label === "収支の累計" && c.month === res.payback;
                    return (
                      <td
                        key={c.type === "m" ? c.month : `q${c.q}`}
                        className={`text-right px-1.5 py-1 tabular-nums text-xs ${c.type === "q" ? "bg-gray-100" : ""} ${rr.danger && n < 0 ? "text-rose-600" : ""} ${isPayback ? "bg-emerald-100 text-emerald-800 font-bold" : ""}`}
                      >
                        {n ? rr.fmt(n) : "-"}
                      </td>
                    );
                  })}
                  <td className={`text-right px-2 tabular-nums text-xs bg-gray-100 ${rr.danger && rr.get(res.year) < 0 ? "text-rose-600" : ""}`}>
                    {rr.get(res.year) ? rr.fmt(rr.get(res.year)) : "-"}
                  </td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-gray-500">
        金額は「万円」。資金は、生産した月に「生産数×原価」が出ていき、売れた月に「単価−販売コスト」が入る考え方です。累計がマイナスから0以上に戻った月を回収月（緑）にしています。
      </p>

      {/* どのカテゴリに売ると儲かるか */}
      <Card className="bg-white shadow-sm">
        <CardContent className="py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">どのカテゴリに売ると儲かるか（1個あたり・販売コストを引いた粗利の高い順）</p>
            <Link href="/sales-plans?settings=1" className="text-xs text-blue-600">販売コストの設定</Link>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b">
              <tr>
                <th className="text-left py-1">カテゴリ</th>
                <th className="text-right py-1">単価</th>
                <th className="text-right py-1">販売コスト</th>
                <th className="text-right py-1">1個の粗利</th>
                <th className="text-right py-1">粗利率</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rankedChannels.map((c) => (
                <tr key={c.id}>
                  <td className="py-1">{c.label}<span className="text-xs text-gray-400 ml-1">{c.ratePct}%</span></td>
                  <td className="text-right tabular-nums">{c.price.toLocaleString()}</td>
                  <td className="text-right tabular-nums text-gray-500">
                    {c.cost ? c.sellCost.toLocaleString() : <span className="text-xs text-gray-300">未設定</span>}
                  </td>
                  <td className={`text-right tabular-nums font-medium ${c.unitGross < 0 ? "text-rose-600" : ""}`}>{c.unitGross.toLocaleString()}</td>
                  <td className="text-right tabular-nums text-gray-500">{c.price > 0 ? `${Math.round((c.unitGross / c.price) * 1000) / 10}%` : "-"}</td>
                  <td className="text-right">
                    <button type="button" onClick={() => addRow(c.id, null)} className="text-xs text-blue-600">＋計画に入れる</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-400 mt-1">販売コストが「未設定」のカテゴリは、手数料・送料などを引いていない粗利です（Amazon・海外は後で実データを入れる予定）。</p>
        </CardContent>
      </Card>
    </div>
  );
}

// 数のマス：入力中は手元だけ、フォーカスが外れたら保存
function QtyCell({ value, onSave }: { value: number; onSave: (q: number) => void }) {
  const [v, setV] = useState(value ? String(value) : "");
  useEffect(() => setV(value ? String(value) : ""), [value]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={() => {
        const q = Number(v) || 0;
        if (q !== value) onSave(q);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      inputMode="numeric"
      className="w-14 border rounded px-1 py-0.5 text-right text-sm tabular-nums focus:border-blue-500 outline-none"
    />
  );
}
