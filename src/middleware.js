import { NextResponse } from "next/server";
import { checkRateLimit, applyRateLimitHeaders } from "./lib/api/rate-limit";

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

const isMutatingMethod = (method) => !["GET", "HEAD", "OPTIONS"].includes(method);

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

export async function middleware(request) {
  const { pathname } = request.nextUrl || {};
  const url = request.nextUrl.clone();
  const host = request.headers.get("x-forwarded-host") || request.nextUrl.hostname || request.headers.get("host") || "";
  const normalizedHost = host.toLowerCase().split(":")[0];
  const queryRegion = url.searchParams.get("region");
  const regionSegment = pathname.split("/")[1];
  const hostRegion = getHostRegion(host);
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
    return NextResponse.redirect(url, 308);
  }

  if (!shouldRateLimit && !hasRegionWork) {
    return NextResponse.next();
  }

  let rateLimitResult = null;
  if (shouldRateLimit) {
    rateLimitResult = await checkRateLimit({ request, id: "global", limit: 30, windowMs: 10_000 });
    if (!rateLimitResult.allowed) {
      return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rateLimitResult);
    }
  }

  let response = NextResponse.next();

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

  return rateLimitResult ? applyRateLimitHeaders(response, rateLimitResult) : response;
}

export const config = {
  matcher: ["/((?!_next|static|favicon|assets|.*\\..*).*)"],
};
