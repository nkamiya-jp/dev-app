// バージョンを上げると activate 時に旧キャッシュを一掃する
const CACHE_NAME = "crm-v3";
const OFFLINE_URL = "/offline";

// オフライン時のフォールバック用に最小限だけ precache
const PRECACHE_URLS = ["/", OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 旧キャッシュを一掃
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();

      // 新しい SW が有効化されたら、開いているタブを最新へ自動リロードする。
      // これにより「自動更新が入る前の古いバンドルに固まった端末」も、
      // 次回アクセス時に手動リロードなしで最新化される（無限ループはしない：
      // sw.js を書き換えたときだけ activate が走り、リロード後は最新 SW 配下で再 activate しないため）。
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        if ("navigate" in client) {
          try {
            await client.navigate(client.url);
          } catch (_) {
            /* 別オリジン等で navigate 不可なら無視 */
          }
        }
      }
    })()
  );
});

// 手動更新トリガ（登録側から postMessage で呼べる）
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // ハッシュ付きの不変アセット（内容が変わればファイル名も変わる）はキャッシュ優先で高速化
  const isImmutable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:woff2?|ttf|png|jpg|jpeg|svg|webp|gif|ico)$/.test(url.pathname);

  if (isImmutable) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // それ以外（HTML・RSC・API・データ）は必ずネットワーク優先。
  // オンラインなら常に最新を取得し、失敗時のみキャッシュ／オフラインページにフォールバック。
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match(OFFLINE_URL);
        return Response.error();
      })
  );
});
