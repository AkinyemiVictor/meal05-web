const CACHE_VERSION = "meal05-pwa-v1";
const STATIC_CACHE = `${CACHE_VERSION}:static`;
const NAVIGATION_CACHE = `${CACHE_VERSION}:pages`;

const STATIC_ASSETS = [
  "/offline.html",
  "/assets/favicon/android-chrome-192x192.png",
  "/assets/favicon/android-chrome-512x512.png",
  "/assets/favicon/apple-touch-icon.png",
  "/assets/favicon/favicon-32x32.png",
  "/assets/favicon/site.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("meal05-pwa-") && !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const isSameOrigin = (url) => url.origin === self.location.origin;

const isCacheableStaticRequest = (request, url) => {
  if (request.method !== "GET" || !isSameOrigin(url)) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/offline.html"
  );
};

const fetchAndCache = async (request, cacheName) => {
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || !isSameOrigin(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetchAndCache(request, NAVIGATION_CACHE).catch(async () => {
        const cachedPage = await caches.match(request);
        return cachedPage || caches.match("/offline.html");
      })
    );
    return;
  }

  if (isCacheableStaticRequest(request, url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetchAndCache(request, STATIC_CACHE);
      })
    );
  }
});
