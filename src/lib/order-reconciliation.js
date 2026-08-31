import { reportCheckoutClientEvent } from "./checkout-telemetry.js";
import {
  fetchWithNetworkRetry,
  getRequestIdFromResponse,
} from "./fetch-with-network-retry.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function reconcileCheckoutOrder({
  idempotencyKey,
  authToken = "",
  maxAttempts = 4,
  signal,
} = {}) {
  const key = String(idempotencyKey || "").trim();
  if (!key) return { state: "not_found", response: null };

  let lastRequestId = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchWithNetworkRetry(
        `/api/orders?idempotencyKey=${encodeURIComponent(key)}`,
        {
          method: "GET",
          cache: "no-store",
          signal,
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        },
        { retries: 1, timeoutMs: 8_000 }
      );
    } catch (error) {
      if (error?.code === "REQUEST_ABORTED") throw error;
      reportCheckoutClientEvent({
        eventType: "reconciliation_failed",
        endpoint: "/api/orders",
        stage: "order_reconciliation_network",
        requestId: error?.requestId || lastRequestId,
        errorCode: error?.code,
        durationMs: error?.durationMs,
        attempts: error?.attempts,
      });
      return { state: "unavailable", response: null };
    }
    lastRequestId = getRequestIdFromResponse(response) || lastRequestId;
    const payload = await response.json().catch(() => ({}));

    if (response.ok && payload?.state === "completed" && payload?.response) {
      reportCheckoutClientEvent({
        eventType: "reconciliation_recovered",
        endpoint: "/api/orders",
        stage: "order_reconciliation",
        requestId: lastRequestId,
        status: response.status,
        attempts: attempt,
      });
      return { state: "completed", response: payload.response, orderId: payload.orderId || null };
    }
    if (response.status === 404 || payload?.state === "not_found") {
      return { state: "not_found", response: null };
    }
    if (payload?.state === "failed") {
      return { state: "failed", response: null };
    }
    if (response.status !== 202 && payload?.state !== "processing") {
      reportCheckoutClientEvent({
        eventType: "reconciliation_failed",
        endpoint: "/api/orders",
        stage: "order_reconciliation",
        requestId: lastRequestId,
        status: response.status,
        attempts: attempt,
      });
      return { state: "unavailable", response: null };
    }
    if (attempt < maxAttempts) await wait(700 * attempt);
  }

  reportCheckoutClientEvent({
    eventType: "reconciliation_failed",
    endpoint: "/api/orders",
    stage: "order_reconciliation_processing",
    requestId: lastRequestId,
    status: 202,
    attempts: maxAttempts,
  });
  return { state: "processing", response: null };
}
