// サイトのロゴ「HUB」。中心のノードから線が伸びる“ハブ”のマーク＋ワードマーク。
// サイドバー・モバイルヘッダー・ログイン画面で共通に使う。
import { cn } from "@/lib/utils";

export function HubMark({ className }: { className?: string }) {
  // 外周6点 → 中心へ集まるスポーク
  const nodes = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return { x: 16 + Math.cos(a) * 9.5, y: 16 + Math.sin(a) * 9.5 };
  });
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="hub-core" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <polygon
        points={nodes.map((n) => `${n.x},${n.y}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1"
      />
      {nodes.map((n, i) => (
        <line key={i} x1="16" y1="16" x2={n.x} y2={n.y} stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.4" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r="2.1" fill="currentColor" />
      ))}
      <circle cx="16" cy="16" r="4.6" fill="url(#hub-core)" />
    </svg>
  );
}

export function HubLogo({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const box = { sm: "size-7 rounded-md", md: "size-9 rounded-lg", lg: "size-16 rounded-2xl" }[size];
  const mark = { sm: "size-5", md: "size-6", lg: "size-11" }[size];
  const text = { sm: "text-base", md: "text-lg", lg: "text-4xl" }[size];
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-950 text-white ring-1 ring-white/15 shadow-lg shadow-black/30",
          box
        )}
      >
        <HubMark className={mark} />
      </div>
      <span className={cn("font-black leading-none tracking-[0.28em] text-white", text)}>
        HUB
      </span>
    </div>
  );
}
