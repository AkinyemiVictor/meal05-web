import { chromium, devices } from "@playwright/test";
import { performance } from "node:perf_hooks";

const DEFAULT_BASE_URL = process.env.MEAL05_MEASURE_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
const baseUrl = (process.argv[2] || DEFAULT_BASE_URL).replace(/\/$/, "");
const term = process.argv[3] || "rice";
const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(term)}`;

const mobileProfile = devices["Pixel 5"];
const throttle = {
  offline: false,
  latency: 150,
  downloadThroughput: Math.floor((1.6 * 1024 * 1024) / 8),
  uploadThroughput: Math.floor((750 * 1024) / 8),
};

const classifyUrl = (url) => {
  if (/\/_next\/static\/.+\.js/i.test(url)) return "script";
  if (/\/_next\/static\/.+\.css/i.test(url)) return "stylesheet";
  if (/\.(?:woff2?|ttf|otf)(?:\?|$)/i.test(url)) return "font";
  if (/\/_next\/image\?|\/storage\/v1\/object\/public\/product-images\//i.test(url)) return "image";
  if (/\/api\/cart/i.test(url)) return "cartApi";
  if (/\/api\/products\//i.test(url)) return "productApi";
  return "other";
};

const summarizeRequests = (requests) => {
  const summary = {};
  for (const req of requests) {
    const key = classifyUrl(req.url);
    if (!summary[key]) summary[key] = { count: 0, bytes: 0 };
    summary[key].count += 1;
    summary[key].bytes += req.bytes || 0;
  }
  return summary;
};

const browserCartCount = () => {
  const readUser = () => {
    try {
      return JSON.parse(localStorage.getItem("meal05_user") || "null");
    } catch {
      return null;
    }
  };
  const user = readUser();
  const email = String(user?.email || "").trim().toLowerCase();
  const key = email ? `meal05_cart_${email}` : "meal05_cart_guest";
  try {
    return JSON.parse(localStorage.getItem(key) || "[]").length;
  } catch {
    return 0;
  }
};

const runPass = async ({ browser, cacheDisabled, label, prewarm = false }) => {
  const context = await browser.newContext({
    ...mobileProfile,
    locale: "en-NG",
    timezoneId: "Africa/Lagos",
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled });
  await client.send("Network.emulateNetworkConditions", throttle);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await page.addInitScript(() => {
    window.__meal05Perf = { lcp: 0, lcpEntry: null, cls: 0 };
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        window.__meal05Perf.lcp = last?.startTime || 0;
        window.__meal05Perf.lcpEntry = last
          ? {
              startTime: Math.round(last.startTime || 0),
              renderTime: Math.round(last.renderTime || 0),
              loadTime: Math.round(last.loadTime || 0),
              size: Math.round(last.size || 0),
              url: last.url || "",
              tagName: last.element?.tagName || "",
              className: String(last.element?.className || "").slice(0, 200),
              text: String(last.element?.innerText || last.element?.alt || "").replace(/\s+/g, " ").trim().slice(0, 200),
              outerHTML: String(last.element?.outerHTML || "").replace(/\s+/g, " ").trim().slice(0, 500),
            }
          : null;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__meal05Perf.cls += entry.value || 0;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });

  const requests = [];
  const requestTimings = new Map();
  page.on("request", (request) => {
    requestTimings.set(request, performance.now());
  });
  page.on("requestfinished", async (request) => {
    const response = await request.response().catch(() => null);
    const sizes = await request.sizes().catch(() => null);
    const responseBodySize = Math.max(0, Number(sizes?.responseBodySize || 0));
    const responseHeadersSize = Math.max(0, Number(sizes?.responseHeadersSize || 0));
    requests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      status: response?.status() || 0,
      ms: Math.round(performance.now() - (requestTimings.get(request) || performance.now())),
      bytes: responseBodySize || responseHeadersSize,
      transferBytes: responseHeadersSize + responseBodySize,
    });
  });

  if (prewarm) {
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
    await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 30_000 });
    requests.length = 0;
    requestTimings.clear();
  }

  const started = performance.now();
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const firstCard = page.locator(".meal05-product-card").first();
  await firstCard.waitFor({ state: "visible", timeout: 120_000 });
  const firstCardsVisibleMs = Math.round(performance.now() - started);
  await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});

  const beforeClickItems = await page.evaluate(browserCartCount);

  const enabledButtonCount = await page.locator(".meal05-product-card button:not([disabled])").count();
  let quickAdd = {
    skipped: enabledButtonCount === 0,
    reason: enabledButtonCount === 0 ? "No enabled Add to cart buttons in this result set." : "",
    enabledProductButtons: enabledButtonCount,
    drawerVisibleMs: null,
    readyMs: null,
    finalAddMs: null,
    ctaDisabled: null,
    localCartCountBefore: beforeClickItems,
    localCartCountAfter: beforeClickItems,
    productDetailRequestMs: null,
    cartApiRequestsAfterFinalAdd: 0,
    cartApiRequestMs: [],
  };

  if (enabledButtonCount > 0) {
    const addButton = page.locator(".meal05-product-card button:not([disabled])").first();
    const quickAddStarted = performance.now();
    await addButton.waitFor({ state: "visible", timeout: 60_000 });
    await addButton.click({ timeout: 60_000 });
    await page.locator(".quick-add-panel").waitFor({ state: "visible", timeout: 60_000 });
    const drawerVisibleMs = Math.round(performance.now() - quickAddStarted);
    const ctaReady = await page
      .locator(".quick-add-cta:not([disabled])")
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    const quickAddReadyMs = ctaReady ? Math.round(performance.now() - quickAddStarted) : null;

    const apiRequestsBeforeFinalAdd = requests.length;
    const cta = page.locator(".quick-add-cta").first();
    const ctaDisabled = await cta.isDisabled().catch(() => true);
    let finalAddMs = null;
    let afterClickItems = beforeClickItems;
    if (ctaReady && !ctaDisabled) {
      const finalAddStarted = performance.now();
      await cta.click({ timeout: 60_000 });
      await page.waitForFunction(
        (previousCount) => {
          try {
          const readUser = () => {
            try {
              return JSON.parse(localStorage.getItem("meal05_user") || "null");
            } catch {
              return null;
            }
          };
          const user = readUser();
          const email = String(user?.email || "").trim().toLowerCase();
          const key = email ? `meal05_cart_${email}` : "meal05_cart_guest";
          return JSON.parse(localStorage.getItem(key) || "[]").length > previousCount;
          } catch {
            return false;
          }
        },
        beforeClickItems,
        { timeout: 60_000 }
      );
      finalAddMs = Math.round(performance.now() - finalAddStarted);
      afterClickItems = await page.evaluate(browserCartCount);
    }

    const apiAfterFinalAdd = requests.slice(apiRequestsBeforeFinalAdd).filter((req) => /\/api\/cart/i.test(req.url));
    const productDetailRequest = requests.find((req) => /\/api\/products\//i.test(req.url));
    const panelText = ctaReady ? "" : await page.locator(".quick-add-panel").innerText().catch(() => "");
    quickAdd = {
      skipped: false,
      reason: ctaReady ? "" : "Quick Add drawer opened, but CTA did not become enabled before timeout.",
      enabledProductButtons: enabledButtonCount,
      drawerVisibleMs,
      readyMs: quickAddReadyMs,
      finalAddMs,
      ctaDisabled,
      panelText: panelText.slice(0, 500),
      localCartCountBefore: beforeClickItems,
      localCartCountAfter: afterClickItems,
      productDetailRequestMs: productDetailRequest?.ms || null,
      cartApiRequestsAfterFinalAdd: apiAfterFinalAdd.length,
      cartApiRequestMs: apiAfterFinalAdd.map((req) => req.ms),
    };
  }

  await page.waitForTimeout(500);

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const resources = performance.getEntriesByType("resource");
    const scripts = resources.filter((entry) => entry.initiatorType === "script");
    const lcpEntry = window.__meal05Perf?.lcpEntry || null;
    const lcpResource = lcpEntry?.url
      ? resources.find((entry) => entry.name === lcpEntry.url || entry.name.includes(lcpEntry.url) || lcpEntry.url.includes(entry.name))
      : null;
    const summarizeResource = (entry) =>
      entry
        ? {
            name: entry.name,
            initiatorType: entry.initiatorType,
            startTime: Math.round(entry.startTime || 0),
            responseStart: Math.round(entry.responseStart || 0),
            responseEnd: Math.round(entry.responseEnd || 0),
            duration: Math.round(entry.duration || 0),
            transferSize: Math.round(entry.transferSize || 0),
            encodedBodySize: Math.round(entry.encodedBodySize || 0),
            decodedBodySize: Math.round(entry.decodedBodySize || 0),
          }
        : null;
    const byTransfer = (items) =>
      items
        .map(summarizeResource)
        .filter(Boolean)
        .sort((a, b) => b.transferSize - a.transferSize)
        .slice(0, 8);

    return {
      ttfb: nav ? Math.round(nav.responseStart) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: Math.round(window.__meal05Perf?.lcp || 0),
      lcpEntry,
      lcpResource: summarizeResource(lcpResource),
      cls: Number((window.__meal05Perf?.cls || 0).toFixed(4)),
      jsTransferBytes: Math.round(scripts.reduce((sum, entry) => sum + (entry.transferSize || 0), 0)),
      cssTransferBytes: Math.round(resources.filter((entry) => entry.initiatorType === "link").reduce((sum, entry) => sum + (entry.transferSize || 0), 0)),
      fontTransferBytes: Math.round(resources.filter((entry) => /font|css/.test(entry.initiatorType) && /\.(woff2?|ttf|otf)(?:\?|$)/i.test(entry.name)).reduce((sum, entry) => sum + (entry.transferSize || 0), 0)),
      resourceCount: resources.length,
      largestScripts: byTransfer(scripts),
      largestStylesheets: byTransfer(resources.filter((entry) => entry.initiatorType === "link" && /\.css(?:\?|$)/i.test(entry.name))),
      largestFonts: byTransfer(resources.filter((entry) => /\.(woff2?|ttf|otf)(?:\?|$)/i.test(entry.name))),
    };
  });

  const productImageRequests = requests.filter((req) => /product-images/i.test(req.url));
  const imageRequests = requests.filter((req) => classifyUrl(req.url) === "image");
  const largestProductImage = productImageRequests.reduce(
    (largest, req) => (req.bytes > largest.bytes ? req : largest),
    { bytes: 0, url: "" }
  );
  const result = {
    label,
    url: searchUrl,
    cacheDisabled,
    metrics,
    firstCardsVisibleMs,
    quickAdd,
    network: {
      totalRequests: requests.length,
      totalBytes: requests.reduce((sum, req) => sum + (req.bytes || 0), 0),
      byType: summarizeRequests(requests),
      productImageRequests: productImageRequests.length,
      productImageBytes: productImageRequests.reduce((sum, req) => sum + (req.bytes || 0), 0),
      allImageRequests: imageRequests.length,
      allImageBytes: imageRequests.reduce((sum, req) => sum + (req.bytes || 0), 0),
      largestProductImageBytes: largestProductImage.bytes,
      largestProductImageUrl: largestProductImage.url,
    },
  };

  await context.close();
  return result;
};

const browser = await chromium.launch({ headless: true });
try {
  const cold = await runPass({ browser, cacheDisabled: true, label: "cold-cache-disabled" });
  const repeat = await runPass({ browser, cacheDisabled: false, label: "repeat-cache-enabled", prewarm: true });
  console.log(JSON.stringify({ term, baseUrl, throttle, results: [cold, repeat] }, null, 2));
} finally {
  await browser.close();
}
