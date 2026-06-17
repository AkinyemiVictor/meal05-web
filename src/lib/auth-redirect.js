const AUTH_ROUTES = ["/sign-in", "/signup", "/auth/"];

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
