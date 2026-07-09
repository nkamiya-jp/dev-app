"use client";

import { useEffect, useMemo } from "react";

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#facc15"];

interface CelebrationProps {
  title?: string;
  sub?: string;
  onClose: () => void;
}

// 納品完了などのタイミングで、紙吹雪＋「ナイス！」を全画面表示。
// クリックまたは数秒で自動的に閉じる。
export function Celebration({ title = "ナイス！ 納品完了 🎉", sub, onClose }: CelebrationProps) {
  // 紙吹雪の各片（位置・色・速度・遅延をランダム）
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        bg: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 0.8,
        duration: 2.2 + Math.random() * 1.8,
        rounded: Math.random() > 0.5,
        w: 7 + Math.random() * 7,
        h: 10 + Math.random() * 10,
      })),
    []
  );

  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
      style={{ animation: "celebrate-fade 0.2s ease-out" }}
      onClick={onClose}
    >
      {/* 紙吹雪 */}
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}vw`,
            width: p.w,
            height: p.h,
            background: p.bg,
            borderRadius: p.rounded ? "50%" : "2px",
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}

      {/* お祝いカード */}
      <div
        className="relative mx-4 max-w-sm rounded-2xl bg-white px-8 py-8 text-center shadow-2xl"
        style={{ animation: "celebrate-pop 0.5s cubic-bezier(0.2,0.8,0.2,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-6xl mb-3">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        {sub && <p className="mt-2 text-sm text-gray-600">{sub}</p>}
        <p className="mt-3 text-lg font-semibold text-blue-600">お疲れさまでした！</p>
        <button
          onClick={onClose}
          className="mt-5 inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
