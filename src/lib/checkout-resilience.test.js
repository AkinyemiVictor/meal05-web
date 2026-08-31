import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  fetchWithNetworkRetry,
  getNetworkRequestMetadata,
  getRequestIdFromResponse,
} from "./fetch-with-network-retry.js";

const readProjectFile = (relativePath) =>
  readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");

test("network retry preserves one correlation id and records request metadata", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const observedRequestIds = [];
  globalThis.fetch = async (_input, init) => {
    observedRequestIds.push(new Headers(init.headers).get("X-Request-ID"));
    if (observedRequestIds.length === 1) throw new TypeError("connection reset");
    return new Response("{}", {
      status: 200,
      headers: { "X-Request-ID": observedRequestIds[0] },
    });
  };

  const response = await fetchWithNetworkRetry("https://meal05.test/api/orders", {}, {
    retries: 1,
    retryDelayMs: 1,
  });

  assert.equal(observedRequestIds.length, 2);
  assert.ok(observedRequestIds[0]?.startsWith("req-"));
  assert.equal(observedRequestIds[1], observedRequestIds[0]);
  assert.equal(getRequestIdFromResponse(response), observedRequestIds[0]);
  assert.equal(getNetworkRequestMetadata(response)?.attempts, 2);
  assert.ok(getNetworkRequestMetadata(response)?.durationMs >= 0);
});

test("service worker excludes private journeys and bounds public caches", async () => {
  const source = await readProjectFile("public/sw.js");

  for (const route of ["/account", "/admin", "/auth", "/checkout", "/dispatch", "/rider", "/sign-in"]) {
    assert.match(source, new RegExp(`\\"${route}\\"`));
  }
  assert.match(source, /isSensitiveNavigation\(url\)/);
  assert.match(source, /cacheControl\.includes\("no-store"\)/);
  assert.match(source, /cacheControl\.includes\("private"\)/);
  assert.match(source, /NAVIGATION_CACHE_LIMIT = 24/);
  assert.match(source, /STATIC_CACHE_LIMIT = 80/);
  assert.match(source, /trimCache\(cache, maximumEntries\)/);
});

test("uncertain order creation is reconciled by the same idempotency key", async () => {
  const [ordersRoute, paymentPage, reconciliation] = await Promise.all([
    readProjectFile("src/app/api/orders/route.js"),
    readProjectFile("src/app/checkout/payment/[providerCode]/page.js"),
    readProjectFile("src/lib/order-reconciliation.js"),
  ]);

  assert.match(ordersRoute, /searchParams\.get\("idempotencyKey"\)/);
  assert.match(ordersRoute, /\.eq\("user_id", user\.id\)/);
  assert.match(ordersRoute, /reconciliationResponse/);
  assert.match(paymentPage, /orderRequestKeyRef\.current = orderIdempotencyKey/);
  assert.match(paymentPage, /reconcileCheckoutOrder/);
  assert.match(reconciliation, /encodeURIComponent\(key\)/);
  assert.match(reconciliation, /cache: "no-store"/);
});

test("checkout telemetry schema accepts only operational, sanitized fields", async () => {
  const source = await readProjectFile("src/app/api/checkout-events/route.js");

  assert.match(source, /\.strict\(\)/);
  assert.doesNotMatch(source, /customerName|deliveryAddress|phone|email|cartItems|paymentReference/);
  assert.match(source, /requestId/);
  assert.match(source, /durationMs/);
  assert.match(source, /cfRay/);
});
