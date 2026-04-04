const CACHE_NAME = "crm-v1";
const OFFLINE_URL = "/offline";

const PRECACHE_URLS = ["/", "/contacts", "/deals", "/tasks", "/notes"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests: network first, cache fallback for GET
  if (url.pathname.startsWith("/api/")) {
    if (request.method === "GET") {
      event.respondWith(
        fetch(request)
          .then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
          .catch(() => caches.match(request))
      );
    }
    return;
  }

  // Static assets and pages: stale-while-revalidate
  if (request.method === "GET") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => {
            // If navigation request fails, show offline page
            if (request.mode === "navigate") {
              return caches.match(OFFLINE_URL);
            }
            return cached;
          });

        return cached || fetchPromise;
      })
    );
  }
});
