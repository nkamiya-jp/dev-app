"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Googleログインが未設定です。管理者に連絡してください。",
  state: "セッションの検証に失敗しました。もう一度お試しください。",
  token: "Google認証に失敗しました。もう一度お試しください。",
  not_allowed: "このアカウントではログインできません（@kamiya-craft.com のアカウントが必要です）。",
};

function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") || "/deals";
  const urlError = searchParams.get("error");
  const googleHref = `/api/auth/google?from=${encodeURIComponent(from)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push(from);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "認証に失敗しました");
      }
    } catch {
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900">
      <div className="w-full max-w-sm mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-zinc-900 rounded-2xl mb-4">
              <span className="text-white text-2xl font-bold">DEV</span>
            </div>
            <h1 className="text-xl font-bold text-zinc-900">別注開発管理</h1>
            <p className="text-sm text-zinc-500 mt-1">会社のGoogleアカウントでログイン</p>
          </div>

          {(error || urlError) && (
            <p className="text-red-500 text-sm text-center mb-4">
              {error || ERROR_MESSAGES[urlError || ""] || "ログインに失敗しました"}
            </p>
          )}

          {/* Googleログイン（メイン） */}
          <a
            href={googleHref}
            className="flex items-center justify-center gap-3 w-full py-3 border border-zinc-300 rounded-lg font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Googleでログイン
          </a>

          {/* パスワードログイン（緊急用フォールバック） */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-xs text-zinc-400 hover:text-zinc-600 underline"
            >
              パスワードでログイン（緊急用）
            </button>
          </div>

          {showPassword && (
            <form onSubmit={handleSubmit} className="space-y-3 mt-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワード"
                className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent text-center tracking-widest"
              />
              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-3 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "認証中..." : "ログイン"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
