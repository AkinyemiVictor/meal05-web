const TELEMETRY_ENDPOINT = "/api/checkout-events";

const cleanText = (value, maxLength) => String(value || "").trim().slice(0, maxLength);

export const reportCheckoutClientEvent = (event = {}) => {
  if (typeof window === "undefined" || typeof fetch !== "function") return;

  const body = {
    eventType: cleanText(event.eventType, 40),
    endpoint: cleanText(event.endpoint, 160),
    stage: cleanText(event.stage, 80),
    requestId: cleanText(event.requestId, 100),
    errorCode: cleanText(event.errorCode, 40),
    status: Number.isInteger(Number(event.status)) ? Number(event.status) : null,
    durationMs: Number.isFinite(Number(event.durationMs)) ? Math.max(0, Math.round(Number(event.durationMs))) : null,
    attempts: Number.isFinite(Number(event.attempts)) ? Math.max(1, Math.round(Number(event.attempts))) : null,
    online: typeof navigator === "undefined" ? null : navigator.onLine !== false,
    cfRay: cleanText(event.cfRay, 100),
  };

  fetch(TELEMETRY_ENDPOINT, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
};
