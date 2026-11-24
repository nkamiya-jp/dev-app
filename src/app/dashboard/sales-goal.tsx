"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SalesGoalSummary } from "@/lib/flam-sales-server";

const ACTUAL = "#2a78d6"; // 実績
const TRACK = "#cde2fb"; // メーターの下地（同じ青の薄い段）
const INK = "#52514e"; // 目標の印・補助の文字

const man = (v: number) => Math.round(v / 10000).toLocaleString();
const monthLabel = (ym: string) => `${Number(ym.slice(5))}月`;

// 目標に対する進み具合（1本のメーター）
function Meter({ label, actual, target, note }: { label: string; actual: number; target: number | null; note?: string }) {
  const rate = target && target > 0 ? (actual / target) * 100 : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-gray-600">{label}</p>
        {rate != null && (
          <p className="text-sm font-bold text-gray-900 tabular-nums">
            {rate >= 100 && <span className="mr-1">🎉 達成</span>}
            {Math.round(rate)}%
          </p>
        )}
      </div>
      <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
        {man(actual)}
        <span className="text-base font-medium text-gray-500">
          {" "}万円{target != null && ` ／ 目標 ${man(target)}万円`}
        </span>
      </p>
      {target != null && (
        <div className="mt-2 h-3 rounded-full overflow-hidden" style={{ background: TRACK }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, rate ?? 0)}%`, background: ACTUAL }} />
        </div>
      )}
      {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
    </div>
  );
}

// 目標は棒ではなく横線の印で示す（棒＝実績と見分けやすく）
function TargetTick(props: { cx?: number; cy?: number; value?: number | null }) {
  if (props.cx == null || props.cy == null || props.value == null) return null;
  return <line x1={props.cx - 14} x2={props.cx + 14} y1={props.cy} y2={props.cy} stroke={INK} strokeWidth={2} strokeLinecap="round" />;
}

export function SalesGoal({
  summary,
  canImport,
  canEditTarget,
}: {
  summary: SalesGoalSummary;
  canImport: boolean;
  canEditTarget: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const { months, thisMonth } = summary;
  const current = months.find((m) => m.month === thisMonth) ?? null;
  // 期の累計：実績は取り込み済みの月まで、目標は期の12ヶ月分
  const termActual = months.reduce((s, m) => s + (m.actual ?? 0), 0);
  const termTarget = months.every((m) => m.target != null) ? months.reduce((s, m) => s + (m.target ?? 0), 0) : null;
  const closed = months.filter((m) => m.month < thisMonth && m.actual != null && m.target != null);
  const achieved = closed.filter((m) => (m.actual ?? 0) >= (m.target ?? 0)).length;
  const hasDefault = months.some((m) => m.targetIsDefault);

  const data = months.map((m) => ({
    name: monthLabel(m.month),
    実績: m.actual != null ? Math.round(m.actual / 10000) : null,
    目標: m.target != null ? Math.round(m.target / 10000) : null,
  }));

  async function upload(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/flam/sales", { method: "POST", body: await file.arrayBuffer() });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(j.error || "取り込めませんでした");
      else {
        setMessage(`${j.months.map((m: string) => monthLabel(m)).join("・")} を取り込みました（${j.rows.toLocaleString()}行・${man(j.total)}万円）`);
        router.refresh();
      }
    } catch {
      setMessage("取り込めませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveTarget(month: string, text: string, before: number | null, wasDefault: boolean) {
    const t = text.trim();
    const amount = t === "" ? null : Math.round(Number(t) * 10000);
    if (amount !== null && !Number.isFinite(amount)) return;
    if (amount === null ? wasDefault || before == null : !wasDefault && amount === before) return;
    const res = await fetch("/api/flam/sales/target", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, amount }),
    });
    if (!res.ok) setMessage("目標を保存できませんでした");
    router.refresh();
  }

  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-bold">売上目標（{summary.term}）</h3>
            <p className="text-xs text-gray-500">
              実績はFLAMの売上集計。
              {summary.lastImportedAt
                ? `最終取り込み ${new Date(summary.lastImportedAt).toLocaleDateString("ja-JP")}（${summary.latestDataMonth ? monthLabel(summary.latestDataMonth) : ""}分まで）`
                : "まだ取り込まれていません"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEditTarget && (
              <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
                {editing ? "目標の編集を閉じる" : "目標を編集"}
              </Button>
            )}
            {canImport && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
                <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                  {busy ? "取り込み中…" : "FLAMのCSVを取り込む"}
                </Button>
              </>
            )}
          </div>
        </div>
        {message && <p className="text-sm rounded bg-blue-50 text-blue-900 px-3 py-2">{message}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Meter
            label={`今月（${monthLabel(thisMonth)}）`}
            actual={current?.actual ?? 0}
            target={current?.target ?? null}
            note={
              current?.actual == null
                ? "今月分はまだ取り込まれていません"
                : current.target != null && current.actual < current.target
                  ? `あと ${man(current.target - current.actual)}万円`
                  : undefined
            }
          />
          <Meter
            label="今期の累計"
            actual={termActual}
            target={termTarget}
            note={
              termTarget == null
                ? "目標が入っていない月があります（「目標を編集」で入れると達成率が出ます）"
                : closed.length > 0
                  ? `締まった${closed.length}ヶ月のうち ${achieved}ヶ月で目標達成`
                  : undefined
            }
          />
        </div>

        <div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e7e5e4" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: INK }} tickLine={false} axisLine={{ stroke: "#d6d3d1" }} />
              <YAxis tick={{ fontSize: 12, fill: INK }} tickLine={false} axisLine={false} width={48} unit="万" />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                formatter={(value, name) => [`${Number(value).toLocaleString()}万円`, name]}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(v) => <span style={{ color: INK }}>{v === "目標" ? "目標（横線）" : "実績（FLAM）"}</span>}
              />
              <Bar dataKey="実績" fill={ACTUAL} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              <Line
                dataKey="目標"
                stroke="none"
                legendType="plainline"
                color={INK}
                dot={<TargetTick />}
                activeDot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          {hasDefault && (
            <p className="text-xs text-gray-500">
              目標を決めていない月は、前年同月の1.1倍を仮の目標にしています。
            </p>
          )}
        </div>

        {editing && (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">（万円）</th>
                  {months.map((m) => (
                    <th key={m.month} className="text-right px-2 py-1.5 font-medium">{monthLabel(m.month)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-2 py-1.5 text-gray-600">目標</td>
                  {months.map((m) => (
                    <td key={m.month} className="px-1 py-1 text-right">
                      <input
                        type="number"
                        defaultValue={m.target != null && !m.targetIsDefault ? Math.round(m.target / 10000) : ""}
                        placeholder={m.targetIsDefault && m.target != null ? `仮 ${man(m.target)}` : "-"}
                        onBlur={(e) => saveTarget(m.month, e.target.value, m.target, m.targetIsDefault)}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        className="w-20 border rounded px-1 py-0.5 text-right"
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-2 py-1.5 text-gray-600">実績</td>
                  {months.map((m) => (
                    <td key={m.month} className="px-2 py-1.5 text-right tabular-nums">{m.actual != null ? man(m.actual) : "-"}</td>
                  ))}
                </tr>
                <tr>
                  <td className="px-2 py-1.5 text-gray-600">前年</td>
                  {months.map((m) => (
                    <td key={m.month} className="px-2 py-1.5 text-right tabular-nums text-gray-500">{m.lastYear != null ? man(m.lastYear) : "-"}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="px-2 py-1.5 text-[11px] text-gray-500">入力して欄の外を押すと保存。空にすると仮の目標（前年同月の1.1倍）に戻ります。</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
