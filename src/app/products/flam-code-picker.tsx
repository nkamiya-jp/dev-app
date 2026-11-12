"use client";

// FLAM（販売管理）の商品コードを選ぶ欄（複数可）。候補は未紐づけのFLAMコードから名前・コードで検索。
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

export type FlamCode = { flamCode: string; flamName: string; spec: string | null };
type Candidate = FlamCode & { priceCount: number };

export function FlamCodePicker({
  value,
  onChange,
}: {
  value: FlamCode[];
  onChange: (v: FlamCode[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const query = search.trim();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/flam/products?search=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error();
        const data: Candidate[] = await res.json();
        if (!cancelled) setItems(data);
      } catch {
        if (!cancelled) setError("候補を読み込めませんでした");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  const chosen = new Set(value.map((v) => v.flamCode));
  const candidates = items.filter((c) => !chosen.has(c.flamCode));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v.flamCode} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-800 text-xs px-2 py-1">
              <span className="font-mono">{v.flamCode}</span>
              <span>{v.flamName}{v.spec ? `（${v.spec}）` : ""}</span>
              <button
                type="button"
                aria-label={`${v.flamCode} を外す`}
                className="text-indigo-400 hover:text-indigo-700"
                onClick={() => onChange(value.filter((x) => x.flamCode !== v.flamCode))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="FLAMの商品名・コードで検索（例: 巾着、N0009）"
        />
        {open && (
          <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-md border bg-white shadow-lg text-sm">
            {loading && <p className="px-3 py-2 text-gray-400">検索中…</p>}
            {error && <p className="px-3 py-2 text-red-600">{error}</p>}
            {!loading && !error && candidates.length === 0 && (
              <p className="px-3 py-2 text-gray-400">未紐づけのFLAMコードが見つかりません</p>
            )}
            {!loading &&
              candidates.map((c) => (
                <button
                  type="button"
                  key={c.flamCode}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange([...value, { flamCode: c.flamCode, flamName: c.flamName, spec: c.spec }]);
                    setSearch("");
                    // 選んだら閉じる（開いたままだと下の保存ボタンに重なって誤クリックになる）
                    setOpen(false);
                    (document.activeElement as HTMLElement | null)?.blur();
                  }}
                >
                  <span className="font-mono text-xs text-gray-500 w-20 shrink-0">{c.flamCode}</span>
                  <span className="flex-1">{c.flamName}{c.spec ? `（${c.spec}）` : ""}</span>
                  {c.priceCount > 0 && (
                    <span className="text-[11px] text-emerald-700 shrink-0">単価 {c.priceCount}社</span>
                  )}
                </button>
              ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400">
        紐づけると、FLAMの直近出荷単価（12ヶ月以内）から顧客別単価を作ります。すでにある顧客別単価は変えません。
      </p>
    </div>
  );
}

// 保存結果を人が読める文に
export function describeFlamResult(r: {
  created: { contactName: string; price: number }[];
  keptExisting: number;
  noContact: number;
  removed?: string[];
}): string {
  const lines: string[] = [];
  if (r.created.length) {
    lines.push(`顧客別単価を ${r.created.length}件 作りました`);
    for (const c of r.created.slice(0, 15)) lines.push(`・${c.contactName}　${c.price.toLocaleString()}円`);
    if (r.created.length > 15) lines.push(`…ほか${r.created.length - 15}件`);
  } else {
    lines.push("新しく作った顧客別単価はありません");
  }
  if (r.keptExisting) lines.push(`すでに顧客別単価があった ${r.keptExisting}社 はそのままです`);
  if (r.noContact) lines.push(`FLAMの得意先がDEV顧客に未登録の ${r.noContact}件 は作れませんでした`);
  if (r.removed?.length) lines.push(`外したFLAMコード: ${r.removed.join(", ")}（作成済みの顧客別単価は残ります）`);
  return lines.join("\n");
}
