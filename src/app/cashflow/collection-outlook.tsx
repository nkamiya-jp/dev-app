"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CollectionOutlook, OutlookCustomer, OutlookMonth } from "@/lib/collection-outlook-server";

// 同じ青の濃淡で「確かさ」の順に並べる：請求済み → 請求前の売上 → 未出荷の受注
const INVOICED = "#1f5fae";
const ESTIMATE = "#5b9be0";
const PENDING = "#b9d5f5";

const man = (v: number) => (v / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 });
const monthNum = (ym: string) => `${Number(ym.slice(5))}月`;
const md = (s: string) => `${Number(s.slice(0, 2))}/${Number(s.slice(3))}`;

const HEADS = [
  { title: "当月入金", hint: "がんばって回収・出荷する" },
  { title: "翌月入金", hint: "今がんばらないと入ってこない" },
  { title: "翌々月入金", hint: "後回しにできる" },
];

const Dot = ({ color }: { color: string }) => <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: color }} />;

function Bar({ m, max }: { m: OutlookMonth; max: number }) {
  if (max <= 0) return null;
  const w = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="h-3 rounded-full overflow-hidden bg-gray-100 flex">
      <div style={{ width: w(m.invoiced), background: INVOICED }} />
      <div style={{ width: w(m.estimate), background: ESTIMATE }} />
      <div style={{ width: w(m.pending), background: PENDING }} />
    </div>
  );
}

function CustomerList({ rows, limit }: { rows: OutlookCustomer[]; limit: number }) {
  const [open, setOpen] = useState(false);
  const list = open ? rows : rows.slice(0, limit);
  if (rows.length === 0) return <p className="text-sm text-gray-400">見込みはありません</p>;
  return (
    <div>
      <table className="w-full text-sm">
        <tbody>
          {list.map((c) => {
            const total = c.invoiced + c.estimate + c.pending;
            const notes: React.ReactNode[] = [];
            if (c.dueDates.length) notes.push(<span key="d">{c.dueDates.map(md).join("・")} 回収予定</span>);
            else notes.push(
              <span key="t" className={c.termIsDefault ? "text-amber-600" : ""}>
                {c.termIsDefault && c.contactId ? "支払サイト未設定（翌月末扱い）" : c.term}
              </span>,
            );
            if (c.received > 0) notes.push(<span key="r" className="text-emerald-700">入金済み {man(c.received)}万</span>);
            if (c.estimateMonths.length) notes.push(<span key="e">{c.estimateMonths.map(monthNum).join("・")}売上（請求前）</span>);
            if (c.pendingOrders > 0) notes.push(<span key="p">未出荷{c.pendingOrders}件</span>);
            if (c.overdueOrders > 0) notes.push(<span key="o" className="text-red-600">納期遅れ{c.overdueOrders}</span>);
            return (
              <tr key={c.key} className="border-t border-gray-100">
                <td className="py-1.5 pr-2">
                  {c.contactId ? (
                    <Link href={`/contacts/${c.contactId}`} className="hover:underline">{c.name}</Link>
                  ) : (
                    <span>{c.name}</span>
                  )}
                  <div className="text-xs text-gray-500 flex flex-wrap gap-x-2">{notes}</div>
                </td>
                <td className="py-1.5 text-right tabular-nums whitespace-nowrap align-top">
                  {man(total)}万
                  {c.invoiced === 0 && <div className="text-xs text-gray-500">見込み</div>}
                  {c.invoiced > 0 && c.invoiced < total && <div className="text-xs text-gray-500">うち見込み {man(total - c.invoiced)}万</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > limit && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-xs text-blue-600 hover:underline">
          {open ? "たたむ" : `ほか${rows.length - limit}社を表示`}
        </button>
      )}
    </div>
  );
}

function MonthCard({ m, i, max }: { m: OutlookMonth; i: number; max: number }) {
  const big = i < 2;
  return (
    <Card className={`bg-white shadow-sm ${big ? "border-l-4 border-l-blue-600" : "opacity-80"}`}>
      <CardContent className={big ? "p-5 space-y-3" : "p-4 space-y-2"}>
        <div className="flex items-baseline justify-between gap-2">
          <p className={big ? "font-bold text-gray-900" : "text-sm font-medium text-gray-700"}>
            {monthNum(m.month)} {HEADS[i].title}
          </p>
          <p className="text-xs text-gray-500">{HEADS[i].hint}</p>
        </div>
        <p className={`${big ? "text-3xl" : "text-xl"} font-bold tabular-nums text-gray-900`}>
          {man(m.total)}
          <span className="text-base font-medium text-gray-500"> 万円</span>
        </p>
        <Bar m={m} max={max} />
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
          <span><Dot color={INVOICED} />請求済み {man(m.invoiced)}万</span>
          <span><Dot color={ESTIMATE} />請求前の売上 {man(m.estimate)}万</span>
          <span><Dot color={PENDING} />未出荷の受注 {man(m.pending)}万</span>
        </div>
        {(m.received > 0 || m.carryover > 0) && (
          <div className="text-xs text-gray-600 space-y-0.5">
            {m.received > 0 && <p>うち入金済み {man(m.received)}万（残り {man(m.invoiced - m.received)}万）</p>}
            {m.carryover > 0 && <p className="text-amber-700">ほかに前月までの回収予定 {man(m.carryover)}万（FLAM）</p>}
          </div>
        )}
        {!m.hasCollection && <p className="text-xs text-gray-400">FLAMの回収予定が未取り込みです（すべて見込み）</p>}
        <CustomerList rows={m.customers} limit={big ? 8 : 3} />
      </CardContent>
    </Card>
  );
}

function ImportButton() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/flam/collections", { method: "POST", body: await file.arrayBuffer() });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "取り込みに失敗しました");
      setMsg(`${j.months.map(monthNum).join("・")}の回収予定を取り込みました（${j.rows}件・${man(j.total)}万円）`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? "取り込み中..." : "FLAM回収予定CSVを取り込む"}
      </Button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </div>
  );
}

export function CollectionOutlookView({ outlook, canImport }: { outlook: CollectionOutlook; canImport?: boolean }) {
  const max = Math.max(...outlook.months.map((m) => m.total), 1);
  const notes: string[] = [];
  const needSales = outlook.months.some((m) => !m.hasCollection);
  if (needSales && outlook.missingFlamMonths.length) {
    notes.push(`FLAMの売上が未取り込みの月があります（${outlook.missingFlamMonths.map(monthNum).join("・")}）。回収予定が無い月の見込みが抜けています。`);
  }
  if (outlook.unlinkedFlamCustomers > 0) {
    notes.push(`DEVの顧客に紐づいていないFLAM請求先が${outlook.unlinkedFlamCustomers}社あります。`);
  }
  if (outlook.noTermContacts > 0) {
    notes.push(`支払サイトが未設定の顧客が${outlook.noTermContacts}社あります（見込みは翌月末払いで計算）。顧客画面で設定できます。`);
  }
  return (
    <div className="space-y-3">
      {canImport && <ImportButton />}
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_0.7fr]">
        {outlook.months.map((m, i) => (
          <MonthCard key={m.month} m={m} i={i} max={max} />
        ))}
      </div>
      <p className="text-xs text-gray-500">
        請求済み＝FLAMの回収予定（税込）。請求前の売上＝FLAM売上集計（最新 {outlook.latestFlamMonth ? monthNum(outlook.latestFlamMonth) : "なし"}）のうち、回収予定にまだ出ていない分（税抜×1.1の概算）。
        未出荷の受注＝DEVの受注の残り数量×単価（税抜×1.1）を、納期の日に出荷する前提で締日・支払サイトから入金月を出しています（納期遅れは今日出す前提）。
      </p>
      {notes.length > 0 && (
        <ul className="text-xs text-amber-700 list-disc pl-5 space-y-0.5">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}
