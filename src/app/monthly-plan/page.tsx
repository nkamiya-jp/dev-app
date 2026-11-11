"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Settings, Trash2 } from "lucide-react";
import { CONTACT_TYPES } from "@/lib/contact-meta";
import { compareProductOrder } from "@/lib/product-meta";

interface MonthSum {
  month: string;
  fixed: number; ad: number; purchase: number; planPurchase: number; productionCost: number;
  purchaseIsManual: boolean; adIsManual: boolean;
  required: number; requiredBasis: string;
  ordered: number; expected: number; push: number; expectedGross: number; pushGross: number;
  gap: number;
}
interface Line {
  contactId: string; contactLabel: string; channel: string; channelLabel: string;
  productId: string; productName: string; productCode: string;
  price: number; priceSource: string; sellCost: number; unitGross: number;
  ordered: number; forecast: number; push: number; expected: number; revenue: number; gross: number;
}
interface ChannelRow { id: string; label: string; ratePct: number | null; expected: number; budget: number; pushRevenue: number; pushGross: number; remaining: number }
interface ProductRow { productId: string; name: string; code: string; cost: number; purchasePerUnit: number; need: number; stockStart: number | null; production: number; balance: number | null; productionCost: number; purchase: number }
interface Plan {
  term: string; months: string[]; month: string; grossRateTarget: number;
  current: MonthSum; summary: MonthSum[]; lines: Line[]; channels: ChannelRow[]; products: ProductRow[];
}
interface ContactOpt { id: string; name: string; company: string | null; type: string | null }
interface ProductOpt { id: string; code: string; name: string; series: string | null; sortOrder: number; active: boolean; ownerContactId?: string | null }

const man = (n: number) => `${(Math.round(n / 1000) / 10).toLocaleString()}万`;
const mLabel = (ym: string) => `${Number(ym.slice(5, 7))}月`;
const SOURCE_LABEL: Record<string, string> = { individual: "顧客別価格", auto: "上代×掛率", standard: "標準卸価格", none: "単価なし" };

export default function MonthlyPlanPage() {
  const [month, setMonth] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async (m: string | null) => {
    const res = await fetch(`/api/monthly-plan${m ? `?month=${m}` : ""}`);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "読み込めませんでした");
      return;
    }
    const d: Plan = await res.json();
    setPlan(d);
    setMonth(d.month);
  }, []);

  useEffect(() => {
    load(null);
    fetch("/api/contacts").then((r) => (r.ok ? r.json() : [])).then((cs: ContactOpt[]) =>
      setContacts([...cs].sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name, "ja")))
    );
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then((ps: ProductOpt[]) => setProducts(ps.filter((p) => p.active).sort(compareProductOrder)));
  }, [load]);

  async function put(url: string, body: Record<string, unknown>) {
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error || "保存できませんでした");
    await load(month);
  }

  if (error) return <div className="p-6 text-gray-500">{error}</div>;
  if (!plan) return <div className="p-6 text-gray-400">読み込み中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">月の収支計画 <span className="text-sm font-normal text-gray-500">{plan.term}</span></h2>
          <p className="text-xs text-gray-500 mt-1">
            必要売上（黒字化のライン）に対して、今見えている売上（受注済み・見込み）でいくら足りないかを見て、
            どのカテゴリ・どの顧客の「攻め」で埋めるかを、生産・仕入の現実と合わせて調整します。
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}><Settings className="size-4 mr-1" /> 販売コストの設定</Button>
      </div>

      <YearStrip plan={plan} onSelect={(m) => load(m)} />

      <TargetCard plan={plan} onSave={(o) => put("/api/monthly-plan", { month: plan.month, ...o })} />

      <LinesCard
        plan={plan}
        contacts={contacts}
        products={products}
        onQty={(l, kind, qty) => put("/api/monthly-plan/forecast", { contactId: l.contactId, productId: l.productId, month: plan.month, kind, qty })}
        onRemove={async (l) => {
          if (!confirm(`${l.contactLabel}・${l.productName} の行を消しますか？`)) return;
          await fetch(`/api/monthly-plan/forecast?${new URLSearchParams({ contactId: l.contactId, productId: l.productId, month: plan.month })}`, { method: "DELETE" });
          load(month);
        }}
      />

      <BudgetCard plan={plan} onBudget={(channel, amount) => put("/api/monthly-plan/budget", { month: plan.month, channel, amount })} />

      <ProductionCard
        plan={plan}
        products={products}
        onProduction={(productId, qty) => put("/api/monthly-plan/production", { productId, month: plan.month, qty })}
      />

      <ChannelCostDialog open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={() => load(month)} />
    </div>
  );
}

// 12か月の帯：必要売上・見えている売上・攻め・不足。押すとその月へ。四半期・年の合計も
function YearStrip({ plan, onSelect }: { plan: Plan; onSelect: (m: string) => void }) {
  const q = [0, 1, 2, 3].map((i) => {
    const ms = plan.summary.slice(i * 3, i * 3 + 3);
    const sum = (k: keyof MonthSum) => ms.reduce((a, m) => a + (m[k] as number), 0);
    return { label: `${i + 1}Q`, required: sum("required"), expected: sum("expected"), push: sum("push"), gap: sum("gap") };
  });
  const y = {
    required: plan.summary.reduce((a, m) => a + m.required, 0),
    expected: plan.summary.reduce((a, m) => a + m.expected, 0),
    push: plan.summary.reduce((a, m) => a + m.push, 0),
    gap: plan.summary.reduce((a, m) => a + m.gap, 0),
  };
  const gapCell = (g: number) => (g > 0 ? <span className="text-rose-600">▲{man(g)}</span> : <span className="text-emerald-700">+{man(-g)}</span>);
  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="p-0 overflow-x-auto">
        <table className="text-xs min-w-max w-full">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-2 py-1.5 sticky left-0 bg-gray-50">万円</th>
              {plan.summary.map((m, i) => [
                <th key={m.month} className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => onSelect(m.month)}
                    className={`w-full rounded px-2 py-1 ${m.month === plan.month ? "bg-zinc-900 text-white" : m.gap > 0 ? "hover:bg-rose-50" : "hover:bg-emerald-50"}`}
                  >
                    {mLabel(m.month)}
                  </button>
                </th>,
                i % 3 === 2 ? <th key={`q${i}`} className="px-2 py-1 bg-gray-100">{q[(i - 2) / 3].label}</th> : null,
              ])}
              <th className="px-2 py-1 bg-gray-100">年</th>
            </tr>
          </thead>
          <tbody className="divide-y tabular-nums">
            {([
              ["必要売上", (m: { required: number }) => man(m.required)],
              ["見えている売上", (m: { expected: number }) => man(m.expected)],
              ["攻め", (m: { push: number }) => (m.push ? man(m.push) : "-")],
            ] as [string, (m: MonthSum | (typeof q)[number] | typeof y) => string][]).map(([label, f]) => (
              <tr key={label}>
                <td className="px-2 py-1 sticky left-0 bg-white text-gray-600">{label}</td>
                {plan.summary.map((m, i) => [
                  <td key={m.month} className={`text-right px-2 py-1 ${m.month === plan.month ? "bg-zinc-50 font-medium" : ""}`}>{f(m)}</td>,
                  i % 3 === 2 ? <td key={`q${i}`} className="text-right px-2 bg-gray-50">{f(q[(i - 2) / 3])}</td> : null,
                ])}
                <td className="text-right px-2 bg-gray-50">{f(y)}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="px-2 py-1 sticky left-0 bg-white">不足（▲）</td>
              {plan.summary.map((m, i) => [
                <td key={m.month} className={`text-right px-2 py-1 ${m.month === plan.month ? "bg-zinc-50" : ""}`}>{gapCell(m.gap)}</td>,
                i % 3 === 2 ? <td key={`q${i}`} className="text-right px-2 bg-gray-50">{gapCell(q[(i - 2) / 3].gap)}</td> : null,
              ])}
              <td className="text-right px-2 bg-gray-50">{gapCell(y.gap)}</td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ① 目標と不足
function TargetCard({ plan, onSave }: { plan: Plan; onSave: (o: Record<string, number | null>) => void }) {
  const c = plan.current;
  const [edit, setEdit] = useState(false);
  const [req, setReq] = useState("");
  const [pur, setPur] = useState("");
  const [ad, setAd] = useState("");
  useEffect(() => {
    setEdit(false);
  }, [plan.month]);
  const visible = c.expected;
  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="py-3 space-y-3">
        <p className="text-sm font-medium">① {mLabel(plan.month)}の目標と不足</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded border p-2">
            <p className="text-[11px] text-gray-500">必要売上（黒字化のライン）</p>
            <p className="text-xl font-bold tabular-nums">{man(c.required)}円</p>
            <p className="text-[11px] text-gray-400">{c.requiredBasis}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-[11px] text-gray-500">見えている売上（受注済み・見込み）</p>
            <p className="text-xl font-bold tabular-nums">{man(visible)}円</p>
            <p className="text-[11px] text-gray-400">うち受注済み {man(c.ordered)}円・粗利 {man(c.expectedGross)}円</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-[11px] text-gray-500">攻め（不足を埋めに行く分）</p>
            <p className="text-xl font-bold tabular-nums">{man(c.push)}円</p>
            <p className="text-[11px] text-gray-400">粗利 {man(c.pushGross)}円</p>
          </div>
          <div className={`rounded border p-2 ${c.gap > 0 ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
            <p className="text-[11px] text-gray-500">{c.gap > 0 ? "まだ足りない" : "達成（上回り）"}</p>
            <p className={`text-xl font-bold tabular-nums ${c.gap > 0 ? "text-rose-600" : "text-emerald-700"}`}>{c.gap > 0 ? "▲" : "+"}{man(Math.abs(c.gap))}円</p>
            <p className="text-[11px] text-gray-400">必要売上 −（見込み＋攻め）</p>
          </div>
        </div>
        <div className="text-xs text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>仕入 {man(c.purchase)}円{c.purchaseIsManual ? "（手入力）" : c.planPurchase ? "（④の生産から自動）" : "（未入力）"}</span>
          <span>固定費 {man(c.fixed)}円（設定）</span>
          <span>広告費 {man(c.ad)}円{c.adIsManual ? "（手入力）" : "（目安）"}</span>
          <span className="text-gray-400">目標の粗利率 {plan.grossRateTarget}%</span>
          {!edit && (
            <button type="button" className="text-blue-600" onClick={() => { setEdit(true); setReq(""); setPur(c.purchaseIsManual ? String(c.purchase) : ""); setAd(c.adIsManual ? String(c.ad) : ""); }}>
              手入力で変える
            </button>
          )}
        </div>
        {edit && (
          <div className="rounded-md border bg-gray-50 p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end text-sm">
            <div>
              <label className="text-[11px] text-gray-500">仕入（空欄＝④の生産から自動）</label>
              <Input value={pur} onChange={(e) => setPur(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder={String(c.planPurchase)} className="bg-white" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">広告費（空欄＝目安）</label>
              <Input value={ad} onChange={(e) => setAd(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" className="bg-white" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">必要売上を直接（空欄＝計算）</label>
              <Input value={req} onChange={(e) => setReq(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" className="bg-white" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onSave({ purchase: pur ? Number(pur) : null, ad: ad ? Number(ad) : null, requiredSales: req ? Number(req) : null }); setEdit(false); }}>保存</Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>キャンセル</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ② 顧客ごとの見込みと攻め（顧客×商品）
function LinesCard({
  plan, contacts, products, onQty, onRemove,
}: {
  plan: Plan;
  contacts: ContactOpt[];
  products: ProductOpt[];
  onQty: (l: Line, kind: "forecast" | "push", qty: number) => void;
  onRemove: (l: Line) => void;
}) {
  const [pending, setPending] = useState<{ contactId: string; productId: string }[]>([]);
  const [addContact, setAddContact] = useState("");
  const [addProduct, setAddProduct] = useState("");
  useEffect(() => setPending([]), [plan.month]);

  const contact = contacts.find((x) => x.id === addContact);
  const productOpts = products.filter((p) => !p.ownerContactId || p.ownerContactId === addContact);
  const pendingLines: Line[] = pending
    .filter((p) => !plan.lines.some((l) => l.contactId === p.contactId && l.productId === p.productId))
    .map((p) => {
      const ct = contacts.find((x) => x.id === p.contactId);
      const pr = products.find((x) => x.id === p.productId);
      return {
        contactId: p.contactId, contactLabel: ct ? ct.company || ct.name : "", channel: ct?.type || "",
        channelLabel: CONTACT_TYPES.find((t) => t.id === ct?.type)?.label || "未分類",
        productId: p.productId, productName: pr?.name || "", productCode: pr?.code || "",
        price: 0, priceSource: "none", sellCost: 0, unitGross: 0, ordered: 0, forecast: 0, push: 0, expected: 0, revenue: 0, gross: 0,
      };
    });
  const lines = [...plan.lines, ...pendingLines];
  const groups = [...new Set(lines.map((l) => l.channelLabel))];

  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="py-3 space-y-2">
        <p className="text-sm font-medium">② 顧客ごとの見込みと攻め（{mLabel(plan.month)}）</p>
        <p className="text-xs text-gray-500">見込み＝今見えている数（受注済みより少なければ受注済みの数で数えます）。攻め＝不足を埋めるために取りに行く数。単価は受注画面と同じ（顧客別価格 → 上代×掛率）。</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b">
              <tr>
                <th className="text-left py-1.5">顧客</th>
                <th className="text-left py-1.5">商品</th>
                <th className="text-right py-1.5 px-2">単価</th>
                <th className="text-right py-1.5 px-2">1個の粗利</th>
                <th className="text-right py-1.5 px-2">受注済み</th>
                <th className="text-right py-1.5 px-2">見込み</th>
                <th className="text-right py-1.5 px-2">攻め</th>
                <th className="text-right py-1.5 px-2">売上</th>
                <th className="text-right py-1.5 px-2">粗利</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const ls = lines.filter((l) => l.channelLabel === g);
                return [
                  <tr key={`g-${g}`} className="bg-gray-50 text-xs">
                    <td colSpan={7} className="py-1 px-1 font-medium text-gray-600">{g}</td>
                    <td className="text-right px-2 tabular-nums font-medium">{man(ls.reduce((a, l) => a + l.revenue, 0))}</td>
                    <td className="text-right px-2 tabular-nums">{man(ls.reduce((a, l) => a + l.gross, 0))}</td>
                    <td />
                  </tr>,
                  ...ls.map((l) => (
                    <tr key={`${l.contactId}-${l.productId}`} className="border-b border-gray-100">
                      <td className="py-1 pl-3">{l.contactLabel}</td>
                      <td className="py-1"><Link href={`/products/${l.productId}`} className="text-blue-600 hover:underline">{l.productName}</Link></td>
                      <td className="text-right px-2 tabular-nums" title={SOURCE_LABEL[l.priceSource]}>{l.price ? l.price.toLocaleString() : "-"}</td>
                      <td className={`text-right px-2 tabular-nums ${l.unitGross < 0 ? "text-rose-600" : ""}`}>{l.price ? l.unitGross.toLocaleString() : "-"}</td>
                      <td className="text-right px-2 tabular-nums text-gray-500">{l.ordered || "-"}</td>
                      <td className="text-right px-1"><QtyCell value={l.forecast} onSave={(q) => onQty(l, "forecast", q)} /></td>
                      <td className="text-right px-1"><QtyCell value={l.push} onSave={(q) => onQty(l, "push", q)} accent /></td>
                      <td className="text-right px-2 tabular-nums">{l.revenue ? man(l.revenue) : "-"}</td>
                      <td className={`text-right px-2 tabular-nums ${l.gross < 0 ? "text-rose-600" : ""}`}>{l.gross ? man(l.gross) : "-"}</td>
                      <td className="text-right">
                        <button type="button" onClick={() => onRemove(l)} className="text-gray-300 hover:text-red-600 p-1" title="この行を消す"><Trash2 className="size-4" /></button>
                      </td>
                    </tr>
                  )),
                ];
              })}
              {lines.length === 0 && (
                <tr><td colSpan={10} className="py-6 text-center text-gray-400 text-sm">まだありません。下で顧客と商品を選んで行を足してください。</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm pt-1">
          <select value={addContact} onChange={(e) => { setAddContact(e.target.value); setAddProduct(""); }} className="border rounded-md px-2 py-1.5 bg-white max-w-[260px]">
            <option value="">顧客を選ぶ</option>
            {CONTACT_TYPES.map((t) => {
              const cs = contacts.filter((x) => x.type === t.id);
              return cs.length ? (
                <optgroup key={t.id} label={t.label}>{cs.map((x) => <option key={x.id} value={x.id}>{x.company || x.name}</option>)}</optgroup>
              ) : null;
            })}
            {contacts.some((x) => !x.type) && (
              <optgroup label="未分類">{contacts.filter((x) => !x.type).map((x) => <option key={x.id} value={x.id}>{x.company || x.name}</option>)}</optgroup>
            )}
          </select>
          <select value={addProduct} onChange={(e) => setAddProduct(e.target.value)} disabled={!addContact} className="border rounded-md px-2 py-1.5 bg-white max-w-[260px]">
            <option value="">商品を選ぶ</option>
            {productOpts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!addContact || !addProduct}
            onClick={() => { setPending((p) => [...p, { contactId: addContact, productId: addProduct }]); setAddProduct(""); }}
          >
            <Plus className="size-4 mr-1" /> 行を足す
          </Button>
          {contact && !contact.type && <span className="text-xs text-amber-700">この顧客は取引タイプが未設定です（顧客の画面で決めるとカテゴリに入ります）</span>}
          {pendingLines.length > 0 && <span className="text-xs text-gray-500">足した行は、見込みか攻めの数を入れると保存されます（単価はそのとき出ます）</span>}
        </div>
      </CardContent>
    </Card>
  );
}

// ③ 不足を埋める：カテゴリへ攻めの予算を振る
function BudgetCard({ plan, onBudget }: { plan: Plan; onBudget: (channel: string, amount: number) => void }) {
  const c = plan.current;
  const totalBudget = plan.channels.reduce((a, x) => a + x.budget, 0);
  const shortBeforePush = c.required - c.expected; // 攻めの前の不足
  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="py-3 space-y-2">
        <p className="text-sm font-medium">③ 不足を埋める：どのカテゴリで取りに行くか（攻めの予算）</p>
        <p className="text-xs text-gray-500">
          見込みだけだと {shortBeforePush > 0 ? <b className="text-rose-600">▲{man(shortBeforePush)}円</b> : <b className="text-emerald-700">達成</b>}。
          カテゴリごとに「攻めでいくら取りに行くか」を振り、②でその顧客・商品の攻めの数を入れていきます。
          {shortBeforePush > 0 && <> 予算の合計 {man(totalBudget)}円（{totalBudget >= shortBeforePush ? "不足を上回っています" : `あと ${man(shortBeforePush - totalBudget)}円 振る必要があります`}）。</>}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b">
              <tr>
                <th className="text-left py-1.5">カテゴリ</th>
                <th className="text-right py-1.5 px-2">見込みの売上</th>
                <th className="text-right py-1.5 px-2">攻めの予算（円）</th>
                <th className="text-right py-1.5 px-2">②で割り当て済み</th>
                <th className="text-right py-1.5 px-2">残り</th>
                <th className="text-right py-1.5 px-2">攻めの粗利</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {plan.channels.map((ch) => (
                <tr key={ch.id || "none"}>
                  <td className="py-1">{ch.label}{ch.ratePct != null && <span className="text-xs text-gray-400 ml-1">{ch.ratePct}%</span>}</td>
                  <td className="text-right px-2 tabular-nums">{ch.expected ? man(ch.expected) : "-"}</td>
                  <td className="text-right px-1"><MoneyCell value={ch.budget} onSave={(a) => onBudget(ch.id, a)} /></td>
                  <td className="text-right px-2 tabular-nums">{ch.pushRevenue ? man(ch.pushRevenue) : "-"}</td>
                  <td className={`text-right px-2 tabular-nums ${ch.remaining > 0 ? "text-amber-700" : ch.budget ? "text-emerald-700" : "text-gray-400"}`}>
                    {ch.budget ? (ch.remaining > 0 ? `あと ${man(ch.remaining)}` : "割り当て済み") : "-"}
                  </td>
                  <td className="text-right px-2 tabular-nums">{ch.pushGross ? man(ch.pushGross) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ④ 現実のチェック：商品ごとに必要な数と、在庫・生産・仕入
function ProductionCard({ plan, products, onProduction }: { plan: Plan; products: ProductOpt[]; onProduction: (productId: string, qty: number) => void }) {
  const [addProduct, setAddProduct] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  useEffect(() => setPending([]), [plan.month]);
  const rows: ProductRow[] = [
    ...plan.products,
    ...pending
      .filter((id) => !plan.products.some((p) => p.productId === id))
      .map((id) => {
        const p = products.find((x) => x.id === id);
        return { productId: id, name: p?.name || "", code: p?.code || "", cost: 0, purchasePerUnit: 0, need: 0, stockStart: null, production: 0, balance: null, productionCost: 0, purchase: 0 };
      }),
  ];
  const totalProd = rows.reduce((a, r) => a + r.productionCost, 0);
  const totalPur = rows.reduce((a, r) => a + r.purchase, 0);
  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="py-3 space-y-2">
        <p className="text-sm font-medium">④ 現実のチェック：在庫・生産・仕入（{mLabel(plan.month)}）</p>
        <p className="text-xs text-gray-500">
          必要な数＝見込み＋攻め。月初の在庫は、今月は今の在庫、翌月からは「前月の在庫＋生産−必要な数」で繰り越します。
          生産の予定は今は手入力です（後で生産計画から読みます）。ここの仕入額が①の必要売上の「仕入」に入ります。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b">
              <tr>
                <th className="text-left py-1.5">商品</th>
                <th className="text-right py-1.5 px-2">必要な数</th>
                <th className="text-right py-1.5 px-2">月初の在庫</th>
                <th className="text-right py-1.5 px-2">生産の予定</th>
                <th className="text-right py-1.5 px-2">過不足</th>
                <th className="text-right py-1.5 px-2">生産額（原価）</th>
                <th className="text-right py-1.5 px-2">仕入額（生地・資材）</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.productId}>
                  <td className="py-1"><Link href={`/products/${r.productId}`} className="text-blue-600 hover:underline">{r.name}</Link></td>
                  <td className="text-right px-2 tabular-nums">{r.need.toLocaleString()}</td>
                  <td className="text-right px-2 tabular-nums text-gray-500">{r.stockStart == null ? "-" : r.stockStart.toLocaleString()}</td>
                  <td className="text-right px-1"><QtyCell value={r.production} onSave={(q) => onProduction(r.productId, q)} /></td>
                  <td className={`text-right px-2 tabular-nums font-medium ${r.balance != null && r.balance < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {r.balance == null ? "-" : r.balance < 0 ? `▲${(-r.balance).toLocaleString()} 足りない` : `+${r.balance.toLocaleString()}`}
                  </td>
                  <td className="text-right px-2 tabular-nums">{r.productionCost ? man(r.productionCost) : "-"}</td>
                  <td className="text-right px-2 tabular-nums">{r.purchase ? man(r.purchase) : "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-gray-400 text-sm">②で見込み・攻めを入れると、ここに商品が出ます</td></tr>}
              {rows.length > 0 && (
                <tr className="font-medium bg-gray-50">
                  <td className="py-1.5" colSpan={5}>合計</td>
                  <td className="text-right px-2 tabular-nums">{man(totalProd)}</td>
                  <td className="text-right px-2 tabular-nums">{man(totalPur)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <select value={addProduct} onChange={(e) => setAddProduct(e.target.value)} className="border rounded-md px-2 py-1.5 bg-white max-w-[280px]">
            <option value="">生産だけ入れる商品を選ぶ</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button size="sm" variant="outline" disabled={!addProduct} onClick={() => { setPending((p) => [...p, addProduct]); setAddProduct(""); }}>
            <Plus className="size-4 mr-1" /> 足す
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function QtyCell({ value, onSave, accent }: { value: number; onSave: (q: number) => void; accent?: boolean }) {
  const [v, setV] = useState(value ? String(value) : "");
  useEffect(() => setV(value ? String(value) : ""), [value]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={() => { const q = Number(v) || 0; if (q !== value) onSave(q); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      inputMode="numeric"
      className={`w-20 border rounded px-1.5 py-0.5 text-right text-sm tabular-nums outline-none focus:border-blue-500 ${accent ? "bg-amber-50 border-amber-200" : ""}`}
    />
  );
}

function MoneyCell({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(value ? String(value) : "");
  useEffect(() => setV(value ? String(value) : ""), [value]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={() => { const n = Number(v) || 0; if (n !== value) onSave(n); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      inputMode="numeric"
      placeholder="0"
      className="w-28 border rounded px-1.5 py-0.5 text-right text-sm tabular-nums outline-none focus:border-blue-500"
    />
  );
}

// 顧客カテゴリごとの販売コスト（％＋1個あたりの額）
function ChannelCostDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [costs, setCosts] = useState<Record<string, { pct: string; perUnit: string }>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    fetch("/api/monthly-plan/channel-costs")
      .then((r) => (r.ok ? r.json() : {}))
      .then((c: Record<string, { pct: number; perUnit: number }>) =>
        setCosts(Object.fromEntries(CONTACT_TYPES.map((t) => [t.id, { pct: c[t.id]?.pct ? String(c[t.id].pct) : "", perUnit: c[t.id]?.perUnit ? String(c[t.id].perUnit) : "" }])))
      );
  }, [open]);
  async function save() {
    setSaving(true);
    const body = Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, { pct: Number(v.pct) || 0, perUnit: Number(v.perUnit) || 0 }]));
    const res = await fetch("/api/monthly-plan/channel-costs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) return alert("保存できませんでした");
    onOpenChange(false);
    onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>販売コストの設定（顧客カテゴリごと）</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500">単価から差し引く、売るためにかかるお金です（粗利の計算に使います）。％は手数料・広告など、1個あたりは配送料・送料など。Amazon・海外は後で実データで入れ直します。</p>
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
        <div className="flex justify-end"><Button onClick={save} disabled={saving}>{saving ? "保存中..." : "保存"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
