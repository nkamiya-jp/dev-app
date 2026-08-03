"use client";

import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // 登録時点で既存のSWが制御していたか（＝初回インストールではなく更新か）
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;

    function reloadOnce() {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    }

    navigator.serviceWorker
      // sw.js 自体は常にネットワークから取得（HTTPキャッシュ由来の取り残しを防ぐ）
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        // 新しいSWが見つかったら、有効化された時点で自動リロード（更新時のみ）
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "activated" && hadController) {
              reloadOnce();
            }
          });
        });

        // 起動時と、以後30分ごと・タブ復帰時に更新チェック
        reg.update();
        const timer = setInterval(() => reg.update(), 30 * 60 * 1000);
        const onFocus = () => reg.update();
        window.addEventListener("focus", onFocus);
        // クリーンアップは通常不要（アプリ全体で常駐）だが念のため
        return () => {
          clearInterval(timer);
          window.removeEventListener("focus", onFocus);
        };
      })
      .catch(() => {
        // registration failed silently
      });

    // 新しいSWが制御を奪ったら（更新時）リロード
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) reloadOnce();
    });

    // ── ビルドID監視による確実な自動更新 ──
    // 自分に埋め込まれたビルドIDと、サーバの現在のビルドIDを比較。
    // 違えば新しいデプロイがあったとみなして再読込（SWの更新検知に依存しない）。
    const myBuild = process.env.NEXT_PUBLIC_BUILD_ID;
    async function checkVersion() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = await res.json();
        if (myBuild && build && build !== myBuild) reloadOnce();
      } catch {
        // ネットワーク不通時は無視
      }
    }
    const vtimer = setInterval(checkVersion, 5 * 60 * 1000); // 5分ごと
    window.addEventListener("visibilitychange", checkVersion); // タブ復帰時
    checkVersion();

    return () => {
      clearInterval(vtimer);
      window.removeEventListener("visibilitychange", checkVersion);
    };
  }, []);

  return null;
}
