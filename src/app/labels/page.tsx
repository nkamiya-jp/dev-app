"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { Barcode } from "@/components/barcode";

interface OrderItem {
  itemId: string;
  orderId: string;
  productId: string | null;
  productName: string;
  shortName: string | null;
  productCode: string;
  contactName: string;
  company: string | null;
  quantity: number;
  shippedQty: number;
  remainQty: number;
  orderDate: string;
  dueDate: string | null;
}
interface ProductOpt {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  fnsku: string | null;
}
interface Resp { orderItems: OrderItem[]; products: ProductOpt[]; }

type Mode = "packing" | "amazon";

const SIZE_PRESETS = [
  { id: "40x30", label: "40 × 30mm（Amazon定番）", w: 40, h: 30 },
  { id: "45x35", label: "45 × 35mm", w: 45, h: 35 },
  { id: "62x40", label: "Brother 62 × 40mm", w: 62, h: 40 },
  { id: "29x90", label: "Brother 29 × 90mm（縦長）", w: 29, h: 90 },
  { id: "custom", label: "カスタム（mm指定）", w: 0, h: 0 },
];
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

  // 梱包カード: 選択した明細
  const [selItems, setSelItems] = useState<Set<string>>(new Set());
  // Amazon: 商品ごとの枚数
  const [copies, setCopies] = useState<Record<string, number>>({});

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
    const res = await fetch(`/api/labels`);
    setData(await res.json());
  }, []);
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

  const items = data?.orderItems ?? [];
  const products = useMemo(() => (data?.products ?? []).filter((p) => mode !== "amazon" || p.fnsku), [data, mode]);

  // 印刷対象ラベルを組み立て
  const packingLabels = items.filter((it) => selItems.has(it.itemId));
  const amazonLabels: { product: ProductOpt; index: number }[] = [];
  for (const p of products) {
    const n = copies[p.id] || 0;
    for (let i = 0; i < n; i++) amazonLabels.push({ product: p, index: i });
  }

  const printCount = mode === "packing" ? packingLabels.length : amazonLabels.length;

  function toggleItem(id: string) {
    setSelItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll() { setSelItems(new Set(items.map((i) => i.itemId))); }
  function clearAll() { setSelItems(new Set()); }

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
          <p className="text-xs text-gray-500 mt-1">梱包作業カード・Amazonバーコードをラベラー（ラベルプリンター）で出力</p>
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
              onClick={() => setMode("amazon")}
              className={`px-3 py-1.5 ${mode === "amazon" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}
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
            <div className="flex items-center gap-3 mb-2">
              <button onClick={selectAll} className="text-blue-600 hover:underline">全選択</button>
              <button onClick={clearAll} className="text-blue-600 hover:underline">選択解除</button>
              <span className="text-gray-400 text-xs">未出荷の受注明細 {items.length}件（{selItems.size}件選択）</span>
            </div>
            <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
              {items.length === 0 ? (
                <div className="p-4 text-gray-400 text-center">未出荷の受注がありません</div>
              ) : items.map((it) => (
                <label key={it.itemId} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selItems.has(it.itemId)} onChange={() => toggleItem(it.itemId)} />
                  <span className="font-medium min-w-[140px]">{it.shortName || it.productName}</span>
                  <span className="text-gray-500">{it.contactName}</span>
                  <span className="ml-auto tabular-nums">×{it.remainQty.toLocaleString()}</span>
                  <span className="text-gray-400 text-xs w-12 text-right">{fmtDate(it.dueDate) || fmtDate(it.orderDate)}</span>
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
      <p className="text-sm text-gray-500 no-print">
        プレビュー（実寸 {w}×{h}mm・{printCount}枚）— 印刷時はラベラーを選び、用紙サイズが {w}×{h}mm になっているか確認してください。
      </p>

      {/* ラベル本体（画面プレビュー＝枠あり / 印刷＝1枚1ページ） */}
      <div className="label-print-area flex flex-wrap gap-2 print:gap-0 print:block">
        {mode === "packing" && packingLabels.map((it) => (
          <div
            key={it.itemId}
            className="label-page bg-white border border-gray-300 print:border-0 overflow-hidden flex flex-col justify-between"
            style={{ width: `${w}mm`, height: `${h}mm`, padding: "2mm" }}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="font-bold leading-tight" style={{ fontSize: "3.4mm" }}>{it.shortName || it.productName}</span>
            </div>
            <div className="font-bold leading-none" style={{ fontSize: "7mm" }}>×{it.remainQty.toLocaleString()}</div>
            <div style={{ fontSize: "2.6mm" }} className="leading-tight">
              <div className="truncate">出荷先: {it.contactName}</div>
              <div className="flex justify-between text-gray-600">
                <span>納期: {fmtDate(it.dueDate) || "-"}</span>
                <span className="font-mono">{it.productCode}</span>
              </div>
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
            {mode === "packing" ? "上で印刷する受注明細を選択してください。" : "上で印刷枚数を入力してください。"}
          </div>
        )}
      </div>
    </div>
  );
}
