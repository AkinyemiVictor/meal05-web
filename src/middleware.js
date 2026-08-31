import { NextResponse } from "next/server";
import { checkRateLimit, applyRateLimitHeaders } from "./lib/api/rate-limit";
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_PATH,
} from "./lib/auth/password-recovery";

const RATE_LIMITED_PREFIXES = [
  "/api/auth",
  "/api/orders",
  "/api/payment",
  "/api/payments",
  "/api/paystack",
  "/api/profile",
  "/api/receipt",
  "/api/waitlist",
  "/api/verify-email",
  "/admin",
];

const RECOVERY_PAGE_PATH = PASSWORD_RECOVERY_PATH.split("?")[0];
const RECOVERY_ALLOWED_PAGE_PATHS = new Set([
  RECOVERY_PAGE_PATH,
  "/auth/callback",
]);
const RECOVERY_ALLOWED_API_PATHS = new Set([
  "/api/auth/change-password",
  "/api/auth/cancel-password-recovery",
]);

const isMutatingMethod = (method) => !["GET", "HEAD", "OPTIONS"].includes(method);
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,100}$/;

const resolveRequestId = (request) => {
  const incoming = String(request.headers.get("x-request-id") || "").trim();
  if (REQUEST_ID_PATTERN.test(incoming)) return incoming;
  return `m5-${crypto.randomUUID()}`;
};

const applyRequestId = (response, requestId) => {
  if (requestId) response.headers.set("X-Request-ID", requestId);
  return response;
};

const nextWithRequestId = (request, requestId) => {
  if (!requestId) return NextResponse.next();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("X-Request-ID", requestId);
  return applyRequestId(NextResponse.next({ request: { headers: requestHeaders } }), requestId);
};

const getHostRegion = (host) => {
  const lowerHost = host.toLowerCase();
  if (lowerHost.endsWith(".com.gh") || lowerHost.endsWith(".gh")) return "gh";
  if (lowerHost.endsWith(".com.ng") || lowerHost.endsWith(".ng")) return "ng";
  return "";
};

const setRegionCookie = (response, code) => {
  response.cookies.set("mk_region", code, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
};

const recoveryBlockedApiResponse = (requestId = "") => {
  const response = NextResponse.json(
    { error: "Finish or cancel password recovery before using your account." },
    { status: 403 }
  );
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return applyRequestId(response, requestId);
};

export async function middleware(request) {
  const { pathname } = request.nextUrl || {};
  const url = request.nextUrl.clone();
  const host = request.headers.get("x-forwarded-host") || request.nextUrl.hostname || request.headers.get("host") || "";
  const normalizedHost = host.toLowerCase().split(":")[0];
  const queryRegion = url.searchParams.get("region");
  const regionSegment = pathname.split("/")[1];
  const hostRegion = getHostRegion(host);
  const hasRecoverySession = Boolean(request.cookies.get(PASSWORD_RECOVERY_COOKIE)?.value);
  const requestId = pathname.startsWith("/api/") ? resolveRequestId(request) : "";
  const hasRegionWork = Boolean(
    hostRegion ||
      queryRegion === "gh" ||
      queryRegion === "ng" ||
      regionSegment === "gh" ||
      regionSegment === "ng"
  );
  const shouldRateLimit =
    isMutatingMethod(request.method) && RATE_LIMITED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (normalizedHost === "www.meal05.com") {
    url.hostname = "meal05.com";
    url.port = "";
    return applyRequestId(NextResponse.redirect(url, 308), requestId);
  }

  if (hasRecoverySession) {
    if (pathname.startsWith("/api/") && !RECOVERY_ALLOWED_API_PATHS.has(pathname)) {
      return recoveryBlockedApiResponse(requestId);
    }

    if (!pathname.startsWith("/api/") && !RECOVERY_ALLOWED_PAGE_PATHS.has(pathname)) {
      url.pathname = RECOVERY_PAGE_PATH;
      url.search = "?recovery=1";
      return applyRequestId(NextResponse.redirect(url, 307), requestId);
    }
  }

  if (!shouldRateLimit && !hasRegionWork) {
    return nextWithRequestId(request, requestId);
  }

  let rateLimitResult = null;
  if (shouldRateLimit) {
    rateLimitResult = await checkRateLimit({ request, id: "global", limit: 30, windowMs: 10_000 });
    if (!rateLimitResult.allowed) {
      return applyRequestId(
        applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rateLimitResult),
        requestId
      );
    }
  }

  let response = nextWithRequestId(request, requestId);

  if (hostRegion) {
    setRegionCookie(response, hostRegion);
  }

  if (queryRegion === "gh" || queryRegion === "ng") {
    url.searchParams.delete("region");
    response = NextResponse.redirect(url);
    setRegionCookie(response, queryRegion);
  }

  if (regionSegment === "gh" || regionSegment === "ng") {
    url.pathname = `/${pathname.split("/").slice(2).join("/")}` || "/";
    response = NextResponse.redirect(url);
    setRegionCookie(response, regionSegment);
  }

  response = rateLimitResult ? applyRateLimitHeaders(response, rateLimitResult) : response;
  return applyRequestId(response, requestId);
}

export const config = {
  matcher: ["/((?!_next|static|favicon|assets|.*\\..*).*)"],
};
