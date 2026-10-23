"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { Ean13Barcode } from "@/components/ean13-barcode";
import { LABEL_STORAGE_KEY } from "@/lib/jan-ledger";

interface JanLabel {
  id: string;
  jan: string;
  productName: string | null;
  nameOther: string | null;
  patternCode: string | null;
  price: number | null;
}

// /labels と同じラベル寸法の設定を共有（TD-2130N：印字幅56mm）
const SIZE_PRESETS = [
  { id: "40x30", label: "40 × 30mm", w: 40, h: 30 },
  { id: "50x30", label: "50 × 30mm", w: 50, h: 30 },
  { id: "56x40", label: "56 × 40mm（TD-2130N 最大幅）", w: 56, h: 40 },
  { id: "custom", label: "カスタム（mm指定）", w: 0, h: 0 },
];
const MAX_PRINT_WIDTH_MM = 56;
const SIZE_KEY = "labels-size";
const JAN_MODULES = 113; // 95 + 左右クワイエットゾーン（11+7）
const MIN_MODULE_MM = 0.264; // JAN の最小倍率 80%
const STD_MODULE_MM = 0.33; // 倍率 100%
// A4シート（4列×8段・余白8mm）。市販のA4ラベル用紙や普通紙に印刷して切る
const A4 = { cols: 4, rows: 8, margin: 8, w: (210 - 16) / 4, h: (297 - 16) / 8 };
const LAYOUT_KEY = "jan-labels-layout";

export default function JanLabelsPage() {
  const [items, setItems] = useState<JanLabel[] | null>(null);
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [presetId, setPresetId] = useState("40x30");
  const [w, setW] = useState(40);
  const [h, setH] = useState(30);
  const [showName, setShowName] = useState(true);
  const [showPattern, setShowPattern] = useState(true);
  const [showPrice, setShowPrice] = useState(false);
  const [layout, setLayout] = useState<"roll" | "a4">("roll");

  useEffect(() => {
    try {
      if (localStorage.getItem(LAYOUT_KEY) === "a4") setLayout("a4");
      const raw = localStorage.getItem(SIZE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.w && s.h) { setW(s.w); setH(s.h); setPresetId(SIZE_PRESETS.some((p) => p.id === s.presetId) ? s.presetId : "custom"); }
      }
    } catch {}
    let ids: string[] = [];
    try {
      ids = JSON.parse(sessionStorage.getItem(LABEL_STORAGE_KEY) || "[]");
    } catch {}
    (async () => {
      const all: JanLabel[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const res = await fetch(`/api/jan?pageSize=500&ids=${ids.slice(i, i + 100).join(",")}`);
        if (res.ok) all.push(...(await res.json()).items);
      }
      setItems(all);
      setCopies(Object.fromEntries(all.map((x) => [x.id, 1])));
    })();
  }, []);

  function applyPreset(id: string) {
    setPresetId(id);
    const p = SIZE_PRESETS.find((x) => x.id === id);
    if (p && p.id !== "custom") {
      setW(p.w); setH(p.h);
      try { localStorage.setItem(SIZE_KEY, JSON.stringify({ w: p.w, h: p.h, presetId: id })); } catch {}
    }
  }
  function setCustom(nw: number, nh: number) {
    setW(nw); setH(nh);
    try { localStorage.setItem(SIZE_KEY, JSON.stringify({ w: nw, h: nh, presetId: "custom" })); } catch {}
  }

  function changeLayout(l: "roll" | "a4") {
    setLayout(l);
    try { localStorage.setItem(LAYOUT_KEY, l); } catch {}
  }

  if (!items) return <div className="p-6 text-gray-400">読み込み中...</div>;

  const labels: { item: JanLabel; index: number }[] = [];
  for (const it of items) for (let i = 0; i < (copies[it.id] || 0); i++) labels.push({ item: it, index: i });

  // 1枚の大きさ（ラベラーは設定値、A4は4列×8段のマス）
  const lw = layout === "a4" ? A4.w : w;
  const lh = layout === "a4" ? A4.h : h;
  // ラベル幅に収まる最大のモジュール幅（左右1.5mm余白、上限は倍率100%）
  const moduleMm = Math.min(STD_MODULE_MM, (lw - 3) / JAN_MODULES);
  const textLines = (showName ? 1 : 0) + (showPattern ? 1 : 0) + (showPrice ? 1 : 0);
  const barHeightMm = Math.max(6, Math.min(lh - 3 - 3 - textLines * 3.2, 22.85 * (moduleMm / STD_MODULE_MM)));

  const printCss = layout === "a4" ? `
    @media print {
      aside, .obp-mobile-header { display: none !important; }
      main { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      .no-print { display: none !important; }
      .label-print-area { display: grid !important; grid-template-columns: repeat(${A4.cols}, ${A4.w}mm); gap: 0 !important; }
      .label-page { border: 0.2mm dashed #bbb !important; break-inside: avoid; }
    }
    @page { size: A4; margin: ${A4.margin}mm; }
  ` : `
    @media print {
      aside, .obp-mobile-header { display: none !important; }
      main { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      .no-print { display: none !important; }
      .label-print-area { display: block !important; }
      .label-page { break-after: page; page-break-after: always; }
      .label-page:last-child { break-after: auto; page-break-after: auto; }
    }
    @page { size: ${w}mm ${h}mm; margin: 0; }
  `;

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: printCss }} />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
        <div>
          <Link href="/jan" className="text-gray-500 hover:text-gray-700 text-sm">← JAN台帳</Link>
          <h2 className="text-2xl font-bold">JANラベル印刷</h2>
        </div>
        <Button onClick={() => window.print()} disabled={labels.length === 0}>
          <Printer className="size-4 mr-1" /> 印刷（{labels.length}枚）
        </Button>
      </div>

      <Card className="p-4 no-print space-y-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="inline-flex rounded-md border overflow-hidden">
            <button type="button" onClick={() => changeLayout("roll")} className={`px-3 py-1.5 ${layout === "roll" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}>ラベラー（1枚ずつ）</button>
            <button type="button" onClick={() => changeLayout("a4")} className={`px-3 py-1.5 border-l ${layout === "a4" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}>A4シート（4列×8段）</button>
          </div>
          {layout === "roll" && <div className="flex items-center gap-2">
            <span className="text-gray-500">ラベル</span>
            <select value={presetId} onChange={(e) => applyPreset(e.target.value)} className="border rounded-md px-2 py-1.5">
              {SIZE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {presetId === "custom" && (
              <span className="flex items-center gap-1">
                <input type="number" value={w} onChange={(e) => setCustom(Number(e.target.value) || 0, h)} className="border rounded w-16 px-2 py-1" /> ×
                <input type="number" value={h} onChange={(e) => setCustom(w, Number(e.target.value) || 0)} className="border rounded w-16 px-2 py-1" /> mm
              </span>
            )}
          </div>}
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> 商品名</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showPattern} onChange={(e) => setShowPattern(e.target.checked)} /> 柄コード</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> 上代</label>
          <span className="text-xs text-gray-400">バーコード倍率 {Math.round((moduleMm / STD_MODULE_MM) * 100)}%</span>
        </div>
        {moduleMm < MIN_MODULE_MM && (
          <p className="text-sm text-amber-600">⚠ この幅ではJANの最小倍率（80%）を下回り、読み取れないことがあります。横幅を広くしてください。</p>
        )}
        {layout === "roll" && w > MAX_PRINT_WIDTH_MM && (
          <p className="text-sm text-amber-600">⚠ 横 {w}mm は TD-2130N の印字幅（{MAX_PRINT_WIDTH_MM}mm）を超えています。</p>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-gray-400">印刷するJANがありません。JAN台帳の一覧でチェックを付けて「ラベル印刷」を押してください。</p>
        ) : (
          <div className="max-h-72 overflow-y-auto border rounded-md divide-y text-sm">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 px-3 py-2">
                <span className="font-mono text-xs">{it.jan}</span>
                <span className="truncate">{it.productName || it.nameOther}</span>
                <span className="text-xs text-gray-500">{it.patternCode}</span>
                <span className="ml-auto flex items-center gap-2 shrink-0">
                  <span className="text-gray-400 text-xs">枚数</span>
                  <input
                    type="number" min={0}
                    value={copies[it.id] ?? 0}
                    onChange={(e) => setCopies((c) => ({ ...c, [it.id]: Math.max(0, Number(e.target.value) || 0) }))}
                    className="border rounded w-20 px-2 py-1 text-right"
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-sm text-gray-500 no-print">
        {layout === "a4"
          ? `プレビュー（1マス ${A4.w}×${A4.h.toFixed(1)}mm・1枚に${A4.cols * A4.rows}個）— 印刷の倍率は「100%」（ページに合わせない）にしてください。`
          : `プレビュー（実寸 ${w}×${h}mm）— 印刷時はラベラーを選び、用紙サイズが ${w}×${h}mm になっているか確認してください。`}
      </p>

      <div className="label-print-area flex flex-wrap gap-2 print:gap-0 print:block">
        {labels.map(({ item, index }) => (
          <div
            key={`${item.id}-${index}`}
            className="label-page bg-white border border-gray-300 print:border-0 overflow-hidden flex flex-col items-center justify-center"
            style={{ width: `${lw}mm`, height: `${lh}mm`, padding: "1.5mm" }}
          >
            {showName && (
              <div className="text-center leading-tight truncate w-full" style={{ fontSize: "2.6mm" }}>
                {item.productName || item.nameOther}
              </div>
            )}
            <Ean13Barcode jan={item.jan} moduleMm={moduleMm} heightMm={barHeightMm} />
            {showPattern && item.patternCode && (
              <div className="text-center leading-tight truncate w-full" style={{ fontSize: "2.4mm" }}>{item.patternCode}</div>
            )}
            {showPrice && item.price != null && (
              <div className="text-center leading-tight font-bold" style={{ fontSize: "2.8mm" }}>
                ¥{item.price.toLocaleString()}<span className="font-normal" style={{ fontSize: "2mm" }}>（税抜）</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
