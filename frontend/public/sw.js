const CACHE_NAME = "resida-v47";
const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const withScope = (path) => `${scopePath}${path === "/" ? "/" : path}`;
const ROOT_URL = withScope("/");
const MANIFEST_URL = withScope("/rukun.webmanifest?v=20260912-2");

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const rootResponse = await fetch(ROOT_URL, { cache: "no-store" });
  if (!rootResponse.ok) throw new Error("Gagal mengambil app shell");
  await cache.put(ROOT_URL, rootResponse.clone());

  const html = await rootResponse.text();
  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.registration.scope))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.href);
  await Promise.all(
    [...new Set([MANIFEST_URL, ...assetUrls])].map(async (url) => {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) await cache.put(url, response);
    })
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(cacheAppShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => Promise.all(clients.map((client) => client.navigate(client.url).catch(() => undefined))))
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  const isNavigation = event.request.mode === "navigate";
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(async () => {
        const exactMatch = await caches.match(event.request);
        if (exactMatch) return exactMatch;
        if (isNavigation) return caches.match(ROOT_URL);
        return Response.error();
      })
  );
});
