const CACHE_VERSION = "meal05-pwa-v3";
const STATIC_CACHE = `${CACHE_VERSION}:static`;
const NAVIGATION_CACHE = `${CACHE_VERSION}:pages`;
const STATIC_CACHE_LIMIT = 80;
const NAVIGATION_CACHE_LIMIT = 24;

// Pages containing account, checkout, or authentication state must always come
// from the network. This keeps one customer's private state out of a shared
// browser cache and prevents old checkout screens from being restored offline.
const SENSITIVE_ROUTE_PREFIXES = [
  "/account",
  "/admin",
  "/auth",
  "/change-password",
  "/checkout",
  "/dispatch",
  "/rider",
  "/sign-in",
  "/sign-up",
];
const SENSITIVE_QUERY_KEYS = new Set([
  "access_token",
  "code",
  "recovery",
  "refresh_token",
  "token",
]);

const STATIC_ASSETS = [
  "/offline.html",
  "/assets/favicon/android-chrome-192x192.png",
  "/assets/favicon/android-chrome-512x512.png",
  "/assets/favicon/android-maskable-192x192.png",
  "/assets/favicon/android-maskable-512x512.png",
  "/assets/favicon/apple-touch-icon.png",
  "/assets/favicon/favicon.ico",
  "/assets/favicon/favicon-16x16.png",
  "/assets/favicon/favicon-32x32.png",
  "/assets/favicon/favicon-48x48.png",
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

const isSensitiveNavigation = (url) =>
  SENSITIVE_ROUTE_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)
  ) || Array.from(SENSITIVE_QUERY_KEYS).some((key) => url.searchParams.has(key));

const responseCanBeCached = (response) => {
  if (!response?.ok || response.type === "opaque") return false;
  const cacheControl = String(response.headers.get("Cache-Control") || "").toLowerCase();
  return !cacheControl.includes("no-store") && !cacheControl.includes("private");
};

const trimCache = async (cache, maximumEntries) => {
  const requests = await cache.keys();
  const overflow = requests.length - maximumEntries;
  if (overflow <= 0) return;
  await Promise.all(requests.slice(0, overflow).map((request) => cache.delete(request)));
};

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

const fetchAndCache = async (request, cacheName, maximumEntries) => {
  const response = await fetch(request);
  if (responseCanBeCached(response)) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    await trimCache(cache, maximumEntries);
  }
  return response;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || !isSameOrigin(url)) return;

  if (request.mode === "navigate") {
    // Let the browser perform a normal network request for sensitive pages. A
    // failed request must not fall back to a previously cached private page.
    if (isSensitiveNavigation(url)) return;
    event.respondWith(
      fetchAndCache(request, NAVIGATION_CACHE, NAVIGATION_CACHE_LIMIT).catch(async () => {
        const cachedPage = await caches.match(request, { cacheName: NAVIGATION_CACHE });
        return cachedPage || caches.match("/offline.html");
      })
    );
    return;
  }

  if (isCacheableStaticRequest(request, url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetchAndCache(request, STATIC_CACHE, STATIC_CACHE_LIMIT);
      })
    );
  }
});
