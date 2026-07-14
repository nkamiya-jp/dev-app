"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { Barcode } from "@/components/barcode";

interface ShipmentLabel {
  shipmentId: string;
  orderId: string | null;
  productId: string | null;
  productName: string;
  shortName: string | null;
  productCode: string;
  contactName: string;
  company: string | null;
  quantity: number;
  shipDate: string;
  status: string;
  note: string | null;
}
interface ProductOpt {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  fnsku: string | null;
}
interface CuttingCard {
  productionId: string;
  productId: string;
  productName: string;
  shortName: string | null;
  productCode: string;
  quantity: number;
  requestDate: string;
  dueDate: string | null;
  cutDone: boolean;
  workers: { name: string; quantity: number; requestDate: string }[];
}
interface Resp { shipments: ShipmentLabel[]; products: ProductOpt[]; cuttingCards: CuttingCard[]; }

const SHIP_STATUS_LABEL: Record<string, string> = {
  scheduled: "予定",
  shipped: "出荷",
  delivered: "配送済",
};

type Mode = "packing" | "amazon" | "cutting";

// TD-2130N: 感熱300dpi・メディア幅19〜63mm・印字幅56mm。横(ロール幅)は56mm以内。
// rayfook 再剥離ラベルの定番寸法に合わせたプリセット。
const SIZE_PRESETS = [
  { id: "40x30", label: "40 × 30mm（Amazon・再剥離 定番）", w: 40, h: 30 },
  { id: "50x30", label: "50 × 30mm", w: 50, h: 30 },
  { id: "56x40", label: "56 × 40mm（TD-2130N 最大幅）", w: 56, h: 40 },
  { id: "50x80", label: "50 × 80mm（縦長・作業カード向き）", w: 50, h: 80 },
  { id: "custom", label: "カスタム（mm指定）", w: 0, h: 0 },
];
const MAX_PRINT_WIDTH_MM = 56; // TD-2130N 印字幅上限
const SIZE_KEY = "labels-size";

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function LabelsPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [mode, setMode] = useState<Mode>("packing");
  const [presetId, setPresetId] = useState("40x30");
  const [w, setW] = useState(40);
  const [h, setH] = useState(30);

  // 梱包カード: 選択した出荷
  const [selItems, setSelItems] = useState<Set<string>>(new Set());
  const [includeDelivered, setIncludeDelivered] = useState(false);
  // Amazon: 商品ごとの枚数
  const [copies, setCopies] = useState<Record<string, number>>({});
  // 裁断カード: 選択した製造依頼
  const [selCut, setSelCut] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIZE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.w && s.h) { setW(s.w); setH(s.h); setPresetId(s.presetId || "custom"); }
      }
    } catch {}
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/labels${includeDelivered ? "?all=1" : ""}`);
    setData(await res.json());
  }, [includeDelivered]);
  useEffect(() => { load(); }, [load]);

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

  const items = data?.shipments ?? [];
  const products = useMemo(() => (data?.products ?? []).filter((p) => mode !== "amazon" || p.fnsku), [data, mode]);

  const cutCards = data?.cuttingCards ?? [];

  // 印刷対象ラベルを組み立て
  const packingLabels = items.filter((it) => selItems.has(it.shipmentId));
  const amazonLabels: { product: ProductOpt; index: number }[] = [];
  for (const p of products) {
    const n = copies[p.id] || 0;
    for (let i = 0; i < n; i++) amazonLabels.push({ product: p, index: i });
  }
  const cuttingLabels = cutCards.filter((c) => selCut.has(c.productionId));

  const printCount = mode === "packing" ? packingLabels.length : mode === "amazon" ? amazonLabels.length : cuttingLabels.length;

  function toggleItem(id: string) {
    setSelItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll() { setSelItems(new Set(items.map((i) => i.shipmentId))); }
  function clearAll() { setSelItems(new Set()); }

  function toggleCut(id: string) {
    setSelCut((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAllCut() { setSelCut(new Set(cutCards.map((c) => c.productionId))); }
  function clearAllCut() { setSelCut(new Set()); }

  if (!data) return <div className="p-6 text-gray-400">読み込み中...</div>;

  // 印刷用 @page 寸法とレイアウト（このページ表示中のみ有効）
  const printCss = `
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

  // 感熱バーコード: ラベル幅からモジュール幅を推定（左右2mm余白）
  const barcodeHeightMm = Math.max(8, Math.min(h * 0.45, 18));

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: printCss }} />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-2xl font-bold">ラベル印刷</h2>
          <p className="text-xs text-gray-500 mt-1">梱包作業カード・裁断カード・Amazonバーコードをラベラー（ラベルプリンター）で出力</p>
        </div>
        <Button onClick={() => window.print()} disabled={printCount === 0}>
          <Printer className="size-4 mr-1" /> 印刷（{printCount}枚）
        </Button>
      </div>

      {/* 設定バー */}
      <Card className="p-4 no-print space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="inline-flex rounded-md border overflow-hidden text-sm">
            <button
              onClick={() => setMode("packing")}
              className={`px-3 py-1.5 ${mode === "packing" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}
            >梱包作業カード</button>
            <button
              onClick={() => setMode("cutting")}
              className={`px-3 py-1.5 border-l ${mode === "cutting" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}
            >裁断カード</button>
            <button
              onClick={() => setMode("amazon")}
              className={`px-3 py-1.5 border-l ${mode === "amazon" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}
            >Amazonバーコード</button>
          </div>

          <div className="flex items-center gap-2 text-sm">
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
            <span className="text-gray-400 text-xs">= {w}×{h}mm</span>
          </div>
        </div>

        {mode === "packing" ? (
          <div className="text-sm">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <button onClick={selectAll} className="text-blue-600 hover:underline">全選択</button>
              <button onClick={clearAll} className="text-blue-600 hover:underline">選択解除</button>
              <span className="text-gray-400 text-xs">出荷 {items.length}件（{selItems.size}件選択）</span>
              <label className="flex items-center gap-1.5 text-gray-600 ml-auto cursor-pointer text-xs">
                <input type="checkbox" checked={includeDelivered} onChange={(e) => setIncludeDelivered(e.target.checked)} />
                配送済も表示
              </label>
            </div>
            <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
              {items.length === 0 ? (
                <div className="p-4 text-gray-400 text-center">対象の出荷がありません。出荷ページで登録してください。</div>
              ) : items.map((it) => (
                <label key={it.shipmentId} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selItems.has(it.shipmentId)} onChange={() => toggleItem(it.shipmentId)} />
                  <span className="text-gray-400 text-xs w-10">{fmtDate(it.shipDate)}</span>
                  <span className="font-medium min-w-[130px]">{it.shortName || it.productName}</span>
                  <span className="text-gray-500 truncate">{it.contactName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{SHIP_STATUS_LABEL[it.status] || it.status}</span>
                  <span className="ml-auto tabular-nums font-medium">×{it.quantity.toLocaleString()}</span>
                </label>
              ))}
            </div>
          </div>
        ) : mode === "cutting" ? (
          <div className="text-sm">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <button onClick={selectAllCut} className="text-blue-600 hover:underline">全選択</button>
              <button onClick={clearAllCut} className="text-blue-600 hover:underline">選択解除</button>
              <span className="text-gray-400 text-xs">未裁断の製造依頼 {cutCards.length}件（{selCut.size}件選択）</span>
              <label className="flex items-center gap-1.5 text-gray-600 ml-auto cursor-pointer text-xs">
                <input type="checkbox" checked={includeDelivered} onChange={(e) => setIncludeDelivered(e.target.checked)} />
                裁断済・納品済も表示
              </label>
            </div>
            <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
              {cutCards.length === 0 ? (
                <div className="p-4 text-gray-400 text-center">対象の製造依頼がありません。製造ページで依頼を登録してください。</div>
              ) : cutCards.map((c) => (
                <label key={c.productionId} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selCut.has(c.productionId)} onChange={() => toggleCut(c.productionId)} />
                  <span className="text-gray-400 text-xs w-10">{fmtDate(c.requestDate)}</span>
                  <span className="font-medium min-w-[130px]">{c.shortName || c.productName}</span>
                  {c.cutDone && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">裁断済</span>}
                  <span className="ml-auto tabular-nums font-medium">×{c.quantity.toLocaleString()}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm">
            <div className="text-gray-400 text-xs mb-2">FNSKU登録済みの商品に、印刷枚数を入力（商品マスタでFNSKUを登録）</div>
            <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
              {products.length === 0 ? (
                <div className="p-4 text-gray-400 text-center">FNSKUが登録された商品がありません。商品マスタで登録してください。</div>
              ) : products.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-medium min-w-[160px]">{p.shortName || p.name}</span>
                  <span className="font-mono text-xs text-gray-500">{p.fnsku}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-gray-400 text-xs">枚数</span>
                    <input
                      type="number" min={0}
                      value={copies[p.id] || 0}
                      onChange={(e) => setCopies((c) => ({ ...c, [p.id]: Math.max(0, Number(e.target.value) || 0) }))}
                      className="border rounded w-20 px-2 py-1 text-right"
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* プレビュー見出し */}
      <div className="no-print space-y-1">
        <p className="text-sm text-gray-500">
          プレビュー（実寸 {w}×{h}mm・{printCount}枚）— 印刷時はラベラー（TD-2130N等）を選び、用紙サイズが {w}×{h}mm になっているか確認してください。
        </p>
        {w > MAX_PRINT_WIDTH_MM && (
          <p className="text-sm text-amber-600">
            ⚠ 横 {w}mm は TD-2130N の印字幅（{MAX_PRINT_WIDTH_MM}mm）を超えています。横は {MAX_PRINT_WIDTH_MM}mm 以内にしてください。
          </p>
        )}
      </div>

      {/* ラベル本体（画面プレビュー＝枠あり / 印刷＝1枚1ページ） */}
      <div className="label-print-area flex flex-wrap gap-2 print:gap-0 print:block">
        {mode === "packing" && packingLabels.map((it) => (
          <div
            key={it.shipmentId}
            className="label-page bg-white border border-gray-300 print:border-0 overflow-hidden flex flex-col justify-between"
            style={{ width: `${w}mm`, height: `${h}mm`, padding: "2mm" }}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="font-bold leading-tight" style={{ fontSize: "3.4mm" }}>{it.shortName || it.productName}</span>
            </div>
            <div className="font-bold leading-none" style={{ fontSize: "7mm" }}>×{it.quantity.toLocaleString()}</div>
            <div style={{ fontSize: "2.6mm" }} className="leading-tight">
              <div className="truncate">出荷先: {it.contactName}</div>
              <div className="flex justify-between text-gray-600">
                <span>出荷日: {fmtDate(it.shipDate) || "-"}</span>
                <span className="font-mono">{it.productCode}</span>
              </div>
            </div>
          </div>
        ))}

        {mode === "cutting" && cuttingLabels.map((c) => (
          <div
            key={c.productionId}
            className="label-page bg-white border border-gray-300 print:border-0 overflow-hidden flex flex-col justify-between"
            style={{ width: `${w}mm`, height: `${h}mm`, padding: "2mm" }}
          >
            <div className="flex items-center justify-between" style={{ fontSize: "2.6mm" }}>
              <span className="text-gray-600">裁断</span>
              <span className="text-gray-600">依頼 {fmtDate(c.requestDate)}</span>
            </div>
            <div className="font-bold leading-tight" style={{ fontSize: "3.4mm" }}>{c.shortName || c.productName}</div>
            <div className="font-bold leading-none" style={{ fontSize: "6mm" }}>{c.quantity.toLocaleString()}<span style={{ fontSize: "2.8mm" }}>個</span></div>
            {/* 依頼先（制作担当者）とその日付 */}
            <div className="leading-tight" style={{ fontSize: "2.6mm" }}>
              {c.workers.length === 0 ? (
                <div className="text-gray-400">依頼先: 未割当</div>
              ) : (
                c.workers.map((wk, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="truncate">依頼先: {wk.name}{c.workers.length > 1 ? `（${wk.quantity}）` : ""}</span>
                    <span className="text-gray-600">{fmtDate(wk.requestDate)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-between text-gray-600" style={{ fontSize: "2.4mm" }}>
              <span>納期: {fmtDate(c.dueDate) || "-"}</span>
              <span className="font-mono">{c.productCode}</span>
            </div>
          </div>
        ))}

        {mode === "amazon" && amazonLabels.map(({ product, index }) => (
          <div
            key={`${product.id}-${index}`}
            className="label-page bg-white border border-gray-300 print:border-0 overflow-hidden flex flex-col items-center justify-center"
            style={{ width: `${w}mm`, height: `${h}mm`, padding: "1.5mm" }}
          >
            <div style={{ width: `${w - 4}mm` }}>
              <Barcode value={product.fnsku!} heightMm={barcodeHeightMm} fitWidth quiet={8} />
            </div>
            <div className="font-mono tracking-wide leading-none mt-0.5" style={{ fontSize: "2.8mm" }}>{product.fnsku}</div>
            <div className="text-center leading-tight mt-0.5 truncate w-full" style={{ fontSize: "2.4mm" }}>
              {product.shortName || product.name} / 新品
            </div>
          </div>
        ))}

        {printCount === 0 && (
          <div className="text-gray-400 text-sm no-print">
            {mode === "packing" ? "上で印刷する出荷を選択してください。" : mode === "cutting" ? "上で印刷する製造依頼を選択してください。" : "上で印刷枚数を入力してください。"}
          </div>
        )}
      </div>
    </div>
  );
}
