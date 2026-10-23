import { encodeEan13 } from "@/lib/ean13";

interface Props {
  jan: string;
  /** 1モジュールの幅(mm)。標準(倍率100%)は 0.33mm。ラベルでは 0.26mm(80%)程度まで */
  moduleMm?: number;
  /** バーの高さ(mm)（数字の部分を除く） */
  heightMm?: number;
  /** 下に数字を表示する */
  showText?: boolean;
  className?: string;
}

// JAN（EAN-13）バーコードを SVG で描画（実寸mm指定・左右のクワイエットゾーン込み）
export function Ean13Barcode({ jan, moduleMm = 0.3, heightMm = 14, showText = true, className }: Props) {
  const enc = encodeEan13(jan);
  if (!enc) return <span className="text-[9px] text-red-500">JANが不正です</span>;

  const quietLeft = 11; // 左クワイエットゾーン（先頭の数字をここに描く）
  const quietRight = 7;
  const total = quietLeft + 95 + quietRight;
  const textH = showText ? 9 : 0; // モジュール単位の数字の高さ
  const barH = (heightMm / moduleMm) | 0;
  const guardExtra = showText ? 5 : 0;
  const h = barH + textH;

  const bars: { x: number; w: number; guard: boolean }[] = [];
  for (let i = 0; i < 95; i++) {
    if (enc.modules[i] !== "1") continue;
    const last = bars[bars.length - 1];
    const guard = enc.guards.has(i);
    if (last && last.x + last.w === quietLeft + i && last.guard === guard) last.w++;
    else bars.push({ x: quietLeft + i, w: 1, guard });
  }

  return (
    <svg
      className={className}
      width={`${total * moduleMm}mm`}
      height={`${h * moduleMm}mm`}
      viewBox={`0 0 ${total} ${h}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`JAN ${jan}`}
    >
      <rect x={0} y={0} width={total} height={h} fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={barH + (b.guard ? guardExtra : 0)} fill="#000" />
      ))}
      {showText && (
        <g fontFamily="OCR-B, 'Courier New', monospace" fontSize={9} fill="#000" textAnchor="middle">
          <text x={quietLeft - 5} y={h - 0.5}>{jan[0]}</text>
          {jan.slice(1, 7).split("").map((c, i) => (
            <text key={`l${i}`} x={quietLeft + 3 + i * 7 + 3.5} y={h - 0.5}>{c}</text>
          ))}
          {jan.slice(7).split("").map((c, i) => (
            <text key={`r${i}`} x={quietLeft + 50 + i * 7 + 3.5} y={h - 0.5}>{c}</text>
          ))}
        </g>
      )}
    </svg>
  );
}

// 画面に描いたバーコード（Ean13Barcode の svg）を SVG / PNG ファイルとして保存する
export function downloadBarcode(svg: SVGSVGElement, filename: string, type: "svg" | "png", pxPerModule = 6) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const save = (blob: Blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.${type}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  if (type === "svg") {
    save(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    return;
  }
  const vb = svg.viewBox.baseVal;
  const w = Math.round(vb.width * pxPerModule);
  const h = Math.round(vb.height * pxPerModule);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((b) => b && save(b), "image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
}
