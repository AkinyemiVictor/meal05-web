const DEFAULT_TIMEOUT_MS = 20_000;
const REQUEST_ID_HEADER = "X-Request-ID";
const responseMetadata = new WeakMap();

export const NETWORK_ERROR_CODES = Object.freeze({
  aborted: "REQUEST_ABORTED",
  network: "NETWORK_FAILURE",
  offline: "OFFLINE",
  timeout: "REQUEST_TIMEOUT",
});

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const createRequestId = (prefix = "m5") => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
};

export class NetworkRequestError extends Error {
  constructor(message, { code, cause, requestId, attempts = 1, durationMs = 0 } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "NetworkRequestError";
    this.code = code || NETWORK_ERROR_CODES.network;
    this.requestId = requestId || "";
    this.attempts = attempts;
    this.durationMs = Math.max(0, Math.round(Number(durationMs) || 0));
  }
}

const browserIsOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

const buildHeaders = (headersInit, requestId) => {
  const headers = new Headers(headersInit || undefined);
  if (!headers.has(REQUEST_ID_HEADER)) headers.set(REQUEST_ID_HEADER, requestId);
  return headers;
};

const runFetchAttempt = async (input, init, { requestId, timeoutMs }) => {
  if (browserIsOffline()) {
    throw new NetworkRequestError("The device is offline.", {
      code: NETWORK_ERROR_CODES.offline,
      requestId,
    });
  }

  const externalSignal = init?.signal;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternalSignal();
  else externalSignal?.addEventListener?.("abort", abortFromExternalSignal, { once: true });

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      headers: buildHeaders(init?.headers, requestId),
      signal: controller.signal,
    });
  } catch (error) {
    if (externalSignal?.aborted) {
      throw new NetworkRequestError("The request was cancelled.", {
        code: NETWORK_ERROR_CODES.aborted,
        cause: error,
        requestId,
      });
    }
    if (timedOut) {
      throw new NetworkRequestError("The request timed out.", {
        code: NETWORK_ERROR_CODES.timeout,
        cause: error,
        requestId,
      });
    }
    if (browserIsOffline()) {
      throw new NetworkRequestError("The connection was interrupted.", {
        code: NETWORK_ERROR_CODES.offline,
        cause: error,
        requestId,
      });
    }
    throw new NetworkRequestError("The network request failed.", {
      code: NETWORK_ERROR_CODES.network,
      cause: error,
      requestId,
    });
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener?.("abort", abortFromExternalSignal);
  }
};

export const isAmbiguousNetworkError = (error) =>
  error?.code === NETWORK_ERROR_CODES.network || error?.code === NETWORK_ERROR_CODES.timeout;

export const getNetworkErrorMessage = (error, fallback = "Unable to complete the request.") => {
  const reference = error?.requestId ? ` Reference: ${String(error.requestId).slice(-12)}.` : "";
  if (error?.code === NETWORK_ERROR_CODES.offline) {
    return `You appear to be offline. Check your internet connection and try again.${reference}`;
  }
  if (error?.code === NETWORK_ERROR_CODES.timeout) {
    return `The request took too long. Check your connection and try again.${reference}`;
  }
  if (error?.code === NETWORK_ERROR_CODES.network) {
    return `The connection was interrupted before we received a response. Please try again.${reference}`;
  }
  return error?.message || fallback;
};

export const getRequestIdFromResponse = (response) =>
  String(response?.headers?.get?.(REQUEST_ID_HEADER) || "").trim();

export const getNetworkRequestMetadata = (response) =>
  response && typeof response === "object" ? responseMetadata.get(response) || null : null;

export async function fetchWithNetworkRetry(
  input,
  init,
  { retries = 1, retryDelayMs = 350, timeoutMs = DEFAULT_TIMEOUT_MS, requestId = createRequestId("req") } = {}
) {
  const startedAt = Date.now();
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await runFetchAttempt(input, init, {
        requestId,
        timeoutMs: Math.max(1_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS),
      });
      responseMetadata.set(response, {
        attempts: attempt + 1,
        durationMs: Date.now() - startedAt,
        requestId: getRequestIdFromResponse(response) || requestId,
      });
      return response;
    } catch (error) {
      lastError = error;
      const retryable = error?.code === NETWORK_ERROR_CODES.network;
      if (attempt >= retries || !retryable) {
        error.attempts = attempt + 1;
        error.durationMs = Date.now() - startedAt;
        throw error;
      }
      await wait(retryDelayMs * (attempt + 1));
    }
  }
  throw lastError;
}
