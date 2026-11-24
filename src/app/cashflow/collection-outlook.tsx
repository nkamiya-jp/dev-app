"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { CollectionOutlook, OutlookCustomer, OutlookMonth } from "@/lib/collection-outlook-server";

const BOOKED = "#2a78d6"; // FLAM計上済み（あとは回収するだけ）
const PENDING = "#9cc3f0"; // 未出荷の受注（出さないと入ってこない）

const man = (v: number) => (v / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 });
const monthNum = (ym: string) => `${Number(ym.slice(5))}月`;

const HEADS = [
  { title: "当月入金", hint: "がんばって回収・出荷する" },
  { title: "翌月入金", hint: "今がんばらないと入ってこない" },
  { title: "翌々月入金", hint: "後回しにできる" },
];

function Bar({ booked, pending, max }: { booked: number; pending: number; max: number }) {
  if (max <= 0) return null;
  return (
    <div className="h-3 rounded-full overflow-hidden bg-gray-100 flex">
      <div style={{ width: `${(booked / max) * 100}%`, background: BOOKED }} />
      <div style={{ width: `${(pending / max) * 100}%`, background: PENDING }} />
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
          {list.map((c) => (
            <tr key={c.key} className="border-t border-gray-100">
              <td className="py-1.5 pr-2">
                {c.contactId ? (
                  <Link href={`/contacts/${c.contactId}`} className="hover:underline">{c.name}</Link>
                ) : (
                  <span>{c.name}</span>
                )}
                <div className="text-xs text-gray-500">
                  <span className={c.termIsDefault ? "text-amber-600" : ""}>
                    {c.termIsDefault && c.contactId ? "支払サイト未設定（翌月末扱い）" : c.term}
                  </span>
                  {c.bookedMonths.length > 0 && <span>・{c.bookedMonths.sort().map(monthNum).join("・")}売上</span>}
                  {c.pendingOrders > 0 && <span>・未出荷{c.pendingOrders}件</span>}
                  {c.overdueOrders > 0 && <span className="text-red-600">（納期遅れ{c.overdueOrders}）</span>}
                </div>
              </td>
              <td className="py-1.5 text-right tabular-nums whitespace-nowrap align-top">
                {man(c.booked + c.pending)}万
                {c.pending > 0 && c.booked > 0 && (
                  <div className="text-xs text-gray-500">うち見込み {man(c.pending)}万</div>
                )}
                {c.pending > 0 && c.booked === 0 && <div className="text-xs text-gray-500">見込み</div>}
              </td>
            </tr>
          ))}
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
    <Card className={`bg-white shadow-sm ${big ? "border-l-4 border-l-blue-500" : "opacity-80"}`}>
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
        <Bar booked={m.booked} pending={m.pending} max={max} />
        <div className="flex gap-4 text-xs text-gray-600">
          <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: BOOKED }} />計上済み {man(m.booked)}万</span>
          <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: PENDING }} />未出荷の受注 {man(m.pending)}万</span>
        </div>
        <CustomerList rows={m.customers} limit={big ? 8 : 3} />
      </CardContent>
    </Card>
  );
}

export function CollectionOutlookView({ outlook }: { outlook: CollectionOutlook }) {
  const max = Math.max(...outlook.months.map((m) => m.total), 1);
  const notes: string[] = [];
  if (outlook.missingFlamMonths.length) {
    notes.push(`FLAMの売上が未取り込みの月があります（${outlook.missingFlamMonths.map(monthNum).join("・")}）。その月の売上分の入金が抜けています。`);
  }
  if (outlook.unlinkedFlamCustomers > 0) {
    notes.push(`DEVの顧客に紐づいていないFLAM得意先が${outlook.unlinkedFlamCustomers}社あります（翌月末払いで計算）。`);
  }
  if (outlook.noTermContacts > 0) {
    notes.push(`支払サイトが未設定の顧客が${outlook.noTermContacts}社あります（翌月末払いで計算）。顧客画面で設定できます。`);
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_0.7fr]">
        {outlook.months.map((m, i) => (
          <MonthCard key={m.month} m={m} i={i} max={max} />
        ))}
      </div>
      <p className="text-xs text-gray-500">
        税込の概算（税抜×1.1）。計上済み＝FLAM売上集計（最新 {outlook.latestFlamMonth ? monthNum(outlook.latestFlamMonth) : "なし"}）。
        未出荷の受注＝DEVの受注の残り数量×単価を、納期の月に出荷する前提で数えています（納期遅れは今月に寄せています）。
        入金月は顧客の締日・支払サイトから計算しています。
      </p>
      {notes.length > 0 && (
        <ul className="text-xs text-amber-700 list-disc pl-5 space-y-0.5">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}
