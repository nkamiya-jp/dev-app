import { encodeCode128B } from "@/lib/code128";

interface BarcodeProps {
  value: string;
  /** 1モジュールの幅(mm)。感熱ラベルは 0.25〜0.33mm 程度が読み取り安定。 */
  moduleMm?: number;
  /** バー部分の高さ(mm) */
  heightMm?: number;
  /** 左右クワイエットゾーン(モジュール数, 既定10) */
  quiet?: number;
  /** true の場合、幅を親要素いっぱい(100%)に伸縮させる（moduleMm を無視） */
  fitWidth?: boolean;
  className?: string;
}

// Code128-B バーコードを SVG で描画（mm 実寸指定）。
export function Barcode({ value, moduleMm = 0.3, heightMm = 12, quiet = 10, fitWidth = false, className }: BarcodeProps) {
  const enc = encodeCode128B(value);
  if (!enc.valid || !value) {
    return <span className="text-[8px] text-red-500">無効なコード</span>;
  }
  const totalModules = enc.modules + quiet * 2;
  const widthMm = totalModules * moduleMm;
  return (
    <svg
      className={className}
      width={fitWidth ? "100%" : `${widthMm}mm`}
      height={`${heightMm}mm`}
      viewBox={`0 0 ${totalModules} ${heightMm}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={totalModules} height={heightMm} fill="#fff" />
      {enc.segments.map((s, i) => (
        <rect key={i} x={s.x + quiet} y={0} width={s.width} height={heightMm} fill="#000" />
      ))}
    </svg>
  );
}
