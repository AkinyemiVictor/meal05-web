const AUTH_ROUTES = ["/sign-in", "/signup", "/auth/"];
const CONFIGURED_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

const parseHttpUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

const isLocalUrl = (url) =>
  url?.hostname === "localhost" || url?.hostname === "127.0.0.1" || url?.hostname === "[::1]";

export const resolveAuthOrigin = (currentOrigin = "", configuredSiteUrl = CONFIGURED_SITE_URL) => {
  const currentUrl = parseHttpUrl(currentOrigin);
  const configuredUrl = parseHttpUrl(configuredSiteUrl);

  // Keep local development local, but never let a stale localhost deployment
  // setting override the real production host in the browser.
  if (isLocalUrl(currentUrl)) return currentUrl.origin;
  if (configuredUrl && !isLocalUrl(configuredUrl)) return configuredUrl.origin;
  if (currentUrl) return currentUrl.origin;
  if (configuredUrl) return configuredUrl.origin;

  throw new Error("A valid site URL is required to start authentication.");
};

export const buildAuthCallbackUrl = ({ configuredSiteUrl, currentOrigin, flow, next } = {}) => {
  const callback = new URL("/auth/callback", resolveAuthOrigin(currentOrigin, configuredSiteUrl));
  const safeNext = sanitizeReturnPath(next, "");

  if (flow) callback.searchParams.set("flow", String(flow));
  if (safeNext) callback.searchParams.set("next", safeNext);

  return callback.toString();
};

export const sanitizeReturnPath = (value, fallback = "/") => {
  const candidate = String(value || "").trim();
  if (!candidate) return fallback;

  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {}

  if (!decoded.startsWith("/")) return fallback;
  if (decoded.startsWith("//")) return fallback;
  if (/^https?:\/\//i.test(decoded)) return fallback;
  if (AUTH_ROUTES.some((route) => decoded.startsWith(route))) return fallback;
  return decoded;
};

export const buildSignInHref = ({ next, tab = "login", hash = "loginForm" } = {}) => {
  const params = new URLSearchParams();
  params.set("tab", tab === "signup" ? "signup" : "login");

  const safeNext = sanitizeReturnPath(next, "");
  if (safeNext) {
    params.set("next", safeNext);
  }

  const fragment = hash ? `#${hash}` : "";
  return `/sign-in?${params.toString()}${fragment}`;
};
