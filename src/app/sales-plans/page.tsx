"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Plus, Settings, Star, Trash2 } from "lucide-react";
import { CONTACT_TYPES } from "@/lib/contact-meta";
import { compareProductOrder } from "@/lib/product-meta";

interface PlanItem {
  id: string;
  name: string;
  term: string;
  adopted: boolean;
  product: { id: string; name: string; code: string; cost: number };
  year: { produced: number; sold: number; revenue: number; gross: number; stock: number; cumulativeCash: number };
  grossRate: number | null;
  payback: string | null;
  lowestCash: number;
  stockShortMonth: string | null;
}
interface BudgetLine {
  key: string;
  contactId: string | null;
  label: string;
  channelLabel: string;
  amount: Record<string, number>;
  qty: Record<string, number>;
  products: { productId: string; name: string; qty: Record<string, number>; amount: Record<string, number> }[];
}
interface ProductOpt { id: string; code: string; name: string; series: string | null; sortOrder: number; active: boolean }

const man = (n: number) => `${(Math.round(n / 1000) / 10).toLocaleString()}万`;
const mLabel = (ym: string) => `${Number(ym.slice(5, 7))}月`;

export default function SalesPlansPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">読み込み中...</div>}>
      <SalesPlans />
    </Suspense>
  );
}

function SalesPlans() {
  const router = useRouter();
  const sp = useSearchParams();
  const [tab, setTab] = useState<"plans" | "budgets">("plans");
  const [plans, setPlans] = useState<PlanItem[] | null>(null);
  const [term, setTerm] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(sp.get("settings") === "1");

  const load = useCallback(async () => {
    const res = await fetch("/api/sales-plans");
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "読み込めませんでした");
      return;
    }
    const d = await res.json();
    setPlans(d.items);
    setTerm(d.term);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function duplicate(id: string) {
    const res = await fetch(`/api/sales-plans/${id}/duplicate`, { method: "POST" });
    if (!res.ok) return alert("コピーできませんでした");
    router.push(`/sales-plans/${(await res.json()).id}`);
  }
  async function remove(p: PlanItem) {
    if (!confirm(`「${p.name}」を削除しますか？`)) return;
    const res = await fetch(`/api/sales-plans/${p.id}`, { method: "DELETE" });
    if (!res.ok) return alert("削除できませんでした");
    load();
  }

  if (error) return <div className="p-6 text-gray-500">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">販売計画 <span className="text-sm font-normal text-gray-500">{term}</span></h2>
          <p className="text-xs text-gray-500 mt-1">商品ごとに、月の生産数とカテゴリ・顧客ごとの販売数を置いて、売上・粗利・在庫・資金の戻り（回収月）を見ます。別案を作って比べ、決めた案を「採用」にすると顧客予算に入ります。</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}><Settings className="size-4 mr-1" /> 販売コストの設定</Button>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4 mr-1" /> 計画を作る</Button>
        </div>
      </div>

      <div className="flex border rounded-md overflow-hidden w-fit text-sm">
        <button type="button" onClick={() => setTab("plans")} className={`px-4 py-1.5 ${tab === "plans" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}>計画（シナリオ）</button>
        <button type="button" onClick={() => setTab("budgets")} className={`px-4 py-1.5 border-l ${tab === "budgets" ? "bg-zinc-900 text-white" : "hover:bg-gray-50"}`}>顧客予算（月別）</button>
      </div>

      {creating && <CreatePlan onCancel={() => setCreating(false)} onCreated={(id) => router.push(`/sales-plans/${id}`)} />}

      {tab === "plans" ? (
        <Card className="bg-white shadow-sm">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2">商品・案</th>
                  <th className="text-right px-2 py-2">生産 → 販売</th>
                  <th className="text-right px-2 py-2">期末在庫</th>
                  <th className="text-right px-2 py-2">売上</th>
                  <th className="text-right px-2 py-2">粗利（率）</th>
                  <th className="text-right px-2 py-2">いちばん深いマイナス</th>
                  <th className="text-right px-2 py-2">回収月</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {plans === null ? (
                  <tr><td colSpan={8} className="text-center text-gray-400 py-8">読み込み中...</td></tr>
                ) : plans.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-gray-400 py-8">まだ計画がありません。「計画を作る」から始めてください。</td></tr>
                ) : (
                  plans.map((p) => (
                    <tr key={p.id} className={p.adopted ? "bg-amber-50/40" : ""}>
                      <td className="px-3 py-2">
                        <p className="text-xs text-gray-500">{p.product.name}</p>
                        <Link href={`/sales-plans/${p.id}`} className="font-medium text-blue-600 hover:underline">{p.name}</Link>
                        {p.adopted && <span className="ml-2 text-[10px] rounded bg-amber-500 text-white px-1.5 py-0.5"><Star className="inline size-3 -mt-0.5" /> 採用</span>}
                      </td>
                      <td className="text-right px-2 tabular-nums">{p.year.produced.toLocaleString()} → {p.year.sold.toLocaleString()}</td>
                      <td className={`text-right px-2 tabular-nums ${p.stockShortMonth ? "text-amber-600" : ""}`}>{p.year.stock.toLocaleString()}</td>
                      <td className="text-right px-2 tabular-nums">{man(p.year.revenue)}</td>
                      <td className="text-right px-2 tabular-nums">{man(p.year.gross)}{p.grossRate != null && <span className="text-xs text-gray-500">（{p.grossRate}%）</span>}</td>
                      <td className={`text-right px-2 tabular-nums ${p.lowestCash < 0 ? "text-rose-600" : ""}`}>{p.lowestCash ? man(p.lowestCash) : "-"}</td>
                      <td className="text-right px-2">{p.payback ? mLabel(p.payback) : p.year.cumulativeCash < 0 ? <span className="text-rose-600 text-xs">期内に回収できない</span> : "-"}</td>
                      <td className="px-2 whitespace-nowrap text-right">
                        <button type="button" onClick={() => duplicate(p.id)} className="text-gray-400 hover:text-blue-600 p-1" title="コピーして別案"><Copy className="size-4" /></button>
                        <button type="button" onClick={() => remove(p)} className="text-gray-400 hover:text-red-600 p-1" title="削除"><Trash2 className="size-4" /></button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Budgets />
      )}

      <ChannelCostDialog open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={load} />
    </div>
  );
}

function CreatePlan({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((ps: ProductOpt[]) => setProducts(ps.filter((p) => p.active).sort(compareProductOrder)));
  }, []);

  async function create() {
    setSaving(true);
    const p = products.find((x) => x.id === productId);
    const res = await fetch("/api/sales-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, name: name.trim() || `${p?.name || ""} 案1` }),
    });
    setSaving(false);
    if (!res.ok) return alert((await res.json().catch(() => ({}))).error || "作れませんでした");
    onCreated((await res.json()).id);
  }

  return (
    <Card className="bg-white shadow-sm border-blue-200">
      <CardContent className="py-3 flex flex-wrap items-end gap-2 text-sm">
        <div className="min-w-[260px]">
          <label className="text-xs text-gray-500">商品</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full border rounded-md px-2 py-2 bg-white">
            <option value="">選ぶ</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.code}）</option>)}
          </select>
        </div>
        <div className="min-w-[240px]">
          <label className="text-xs text-gray-500">案の名前</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：2,000個・Amazon重視" />
        </div>
        <Button size="sm" onClick={create} disabled={!productId || saving}>{saving ? "作成中..." : "作る"}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>キャンセル</Button>
      </CardContent>
    </Card>
  );
}

// 顧客ごとの月の予算（採用した案の合計）
function Budgets() {
  const [d, setD] = useState<{ months: string[]; adoptedPlans: number; lines: BudgetLine[]; monthTotals: Record<string, number> } | null>(null);
  const [unit, setUnit] = useState<"amount" | "qty">("amount");
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/sales-plans/budgets").then((r) => (r.ok ? r.json() : null)).then(setD);
  }, []);
  if (!d) return <p className="text-sm text-gray-400">読み込み中...</p>;
  if (!d.adoptedPlans) return <p className="text-sm text-gray-500">採用した案がまだありません。計画を開いて「この案を採用」を押すと、ここに顧客ごとの月の予算が出ます。</p>;

  const cols: ({ type: "m"; month: string } | { type: "q"; q: number })[] = [];
  d.months.forEach((m, i) => {
    cols.push({ type: "m", month: m });
    if (i % 3 === 2) cols.push({ type: "q", q: i / 3 });
  });
  const val = (rec: Record<string, number>, c: (typeof cols)[number]) =>
    c.type === "m" ? rec[c.month] || 0 : d.months.slice(c.q * 3, c.q * 3 + 3).reduce((a, m) => a + (rec[m] || 0), 0);
  const fmt = (n: number) => (n ? (unit === "amount" ? man(n) : n.toLocaleString()) : "-");
  const year = (rec: Record<string, number>) => d.months.reduce((a, m) => a + (rec[m] || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm">
        <div className="flex border rounded-md overflow-hidden">
          <button type="button" onClick={() => setUnit("amount")} className={`px-3 py-1 ${unit === "amount" ? "bg-zinc-900 text-white" : ""}`}>金額（万円）</button>
          <button type="button" onClick={() => setUnit("qty")} className={`px-3 py-1 border-l ${unit === "qty" ? "bg-zinc-900 text-white" : ""}`}>個数</button>
        </div>
        <span className="text-xs text-gray-500">採用した案 {d.adoptedPlans}件の合計。顧客名を押すと商品ごとに分かれます。</span>
      </div>
      <Card className="bg-white shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="text-sm min-w-max">
            <thead className="bg-gray-50 border-b text-xs text-gray-500">
              <tr>
                <th className="text-left px-2 py-2 sticky left-0 bg-gray-50 min-w-[200px]">顧客</th>
                {cols.map((c) => c.type === "m"
                  ? <th key={c.month} className="text-right px-2 py-2">{mLabel(c.month)}</th>
                  : <th key={`q${c.q}`} className="text-right px-2 py-2 bg-gray-100">{c.q + 1}Q</th>)}
                <th className="text-right px-2 py-2 bg-gray-100">年計</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {d.lines.map((l) => {
                const rec = unit === "amount" ? l.amount : l.qty;
                const isOpen = open.has(l.key);
                return [
                  <tr key={l.key}>
                    <td className="px-2 py-1.5 sticky left-0 bg-white">
                      <button
                        type="button"
                        onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(l.key)) n.delete(l.key); else n.add(l.key); return n; })}
                        className={`text-left ${l.contactId ? "font-medium" : "text-gray-500"}`}
                      >
                        <span className="text-[10px] rounded bg-gray-100 px-1.5 py-0.5 mr-1">{l.channelLabel}</span>
                        {l.label}
                      </button>
                    </td>
                    {cols.map((c) => <td key={c.type === "m" ? c.month : `q${c.q}`} className={`text-right px-2 tabular-nums ${c.type === "q" ? "bg-gray-50" : ""}`}>{fmt(val(rec, c))}</td>)}
                    <td className="text-right px-2 tabular-nums bg-gray-50 font-medium">{fmt(year(rec))}</td>
                  </tr>,
                  ...(isOpen
                    ? l.products.map((p) => {
                        const pr = unit === "amount" ? p.amount : p.qty;
                        return (
                          <tr key={`${l.key}-${p.productId}`} className="text-xs text-gray-600 bg-gray-50/40">
                            <td className="px-2 py-1 pl-8 sticky left-0 bg-gray-50">{p.name}</td>
                            {cols.map((c) => <td key={c.type === "m" ? c.month : `q${c.q}`} className={`text-right px-2 tabular-nums ${c.type === "q" ? "bg-gray-50" : ""}`}>{fmt(val(pr, c))}</td>)}
                            <td className="text-right px-2 tabular-nums bg-gray-50">{fmt(year(pr))}</td>
                          </tr>
                        );
                      })
                    : []),
                ];
              })}
              {unit === "amount" && (
                <tr className="bg-gray-50 font-medium">
                  <td className="px-2 py-1.5 sticky left-0 bg-gray-50">合計</td>
                  {cols.map((c) => <td key={c.type === "m" ? c.month : `q${c.q}`} className="text-right px-2 tabular-nums">{fmt(val(d.monthTotals, c))}</td>)}
                  <td className="text-right px-2 tabular-nums">{fmt(year(d.monthTotals))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// 顧客カテゴリごとの販売コスト（％＋1個あたりの額）
function ChannelCostDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [costs, setCosts] = useState<Record<string, { pct: string; perUnit: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/sales-plans/channel-costs")
      .then((r) => (r.ok ? r.json() : {}))
      .then((c: Record<string, { pct: number; perUnit: number }>) =>
        setCosts(Object.fromEntries(CONTACT_TYPES.map((t) => [t.id, { pct: c[t.id]?.pct ? String(c[t.id].pct) : "", perUnit: c[t.id]?.perUnit ? String(c[t.id].perUnit) : "" }])))
      );
  }, [open]);

  async function save() {
    setSaving(true);
    const body = Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, { pct: Number(v.pct) || 0, perUnit: Number(v.perUnit) || 0 }]));
    const res = await fetch("/api/sales-plans/channel-costs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) return alert("保存できませんでした");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>販売コストの設定（顧客カテゴリごと）</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500">
          単価から差し引く、売るためにかかるお金です。％は手数料・広告など、1個あたりは配送料・送料など。
          Amazon・海外は後で Seller Central などの実データで入れ直します。
        </p>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 border-b">
            <tr><th className="text-left py-1">カテゴリ</th><th className="text-right py-1">％</th><th className="text-right py-1">1個あたり（円）</th></tr>
          </thead>
          <tbody className="divide-y">
            {CONTACT_TYPES.map((t) => (
              <tr key={t.id}>
                <td className="py-1.5">{t.label}<span className="text-xs text-gray-400 ml-1">{t.defaultRate}%</span></td>
                <td className="py-1.5 text-right">
                  <Input value={costs[t.id]?.pct ?? ""} onChange={(e) => setCosts((c) => ({ ...c, [t.id]: { ...c[t.id], pct: e.target.value.replace(/[^\d.]/g, "") } }))} inputMode="decimal" className="w-20 ml-auto h-8 text-right" placeholder="0" />
                </td>
                <td className="py-1.5 text-right">
                  <Input value={costs[t.id]?.perUnit ?? ""} onChange={(e) => setCosts((c) => ({ ...c, [t.id]: { ...c[t.id], perUnit: e.target.value.replace(/[^\d]/g, "") } }))} inputMode="numeric" className="w-24 ml-auto h-8 text-right" placeholder="0" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
