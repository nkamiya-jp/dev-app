"use client";

// ロードマップ（ホーム・掲示板・事業目標）で共通の小さな部品
import { eventColor, formatEventDate } from "@/lib/roadmap/portal";

export const selectCls = "w-full border rounded-md px-2 py-1.5 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400";
export const areaCls = "w-full border rounded-md px-2 py-1.5 text-sm min-h-[72px] disabled:bg-gray-50 disabled:text-gray-400";

const STATUS_COLOR: Record<string, string> = {
  未着手: "bg-gray-100 text-gray-600",
  進行中: "bg-blue-50 text-blue-700",
  達成: "bg-emerald-100 text-emerald-800",
  未達: "bg-rose-50 text-rose-700",
  設定中: "bg-gray-100 text-gray-700",
  合意済: "bg-blue-100 text-blue-800",
  評価中: "bg-amber-100 text-amber-800",
  確定: "bg-emerald-100 text-emerald-800",
};

export function StatusChip({ s }: { s: string | null | undefined }) {
  if (!s) return null;
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${STATUS_COLOR[s] ?? "bg-gray-100 text-gray-600"}`}>{s}</span>;
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-0.5 ${className ?? ""}`}>
      <label className="text-[11px] text-gray-500">{label}</label>
      {children}
    </div>
  );
}

// 本文の URL をリンクにする（改行はそのまま）
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <p className={`whitespace-pre-wrap break-words ${className ?? ""}`}>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-blue-600 underline">
            {p}
          </a>
        ) : (
          p
        )
      )}
    </p>
  );
}

export interface EventRow {
  id: string;
  startDate: string;
  endDate: string | null;
  category: string | null;
  title: string;
  detail: string | null;
  visibility: string;
}

export function EventLine({ e, today, onClick }: { e: EventRow; today: string; onClick?: () => void }) {
  const isToday = e.startDate <= today && (e.endDate || e.startDate) >= today;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-start gap-2 rounded px-1 py-1 text-left text-sm enabled:hover:bg-gray-50"
    >
      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: eventColor(e.category) }} />
      <span className="w-28 shrink-0 text-xs text-gray-500 pt-0.5">
        {formatEventDate(e.startDate, e.endDate)}
        {isToday && <span className="ml-1 rounded bg-blue-600 px-1 text-[10px] text-white">今日</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{e.title}</span>
        {e.category && <span className="ml-1.5 text-[11px] text-gray-500">{e.category}</span>}
        {e.visibility === "社長のみ" && <span className="ml-1.5 rounded bg-zinc-800 px-1 text-[10px] text-white">社長のみ</span>}
        {e.detail && <span className="block text-xs text-gray-500 whitespace-pre-wrap">{e.detail}</span>}
      </span>
    </button>
  );
}

export async function errorOf(res: Response, fallback = "保存できませんでした"): Promise<string> {
  return (await res.json().catch(() => ({}))).error || fallback;
}
