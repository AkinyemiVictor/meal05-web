const CUSTOMER_CHROME_HIDDEN_EXACT_PATHS = new Set([
  "/",
  "/landing",
  "/sign-in",
  "/signup",
]);

const CUSTOMER_CHROME_HIDDEN_PREFIXES = [
  "/admin",
  "/auth/",
  "/checkout",
];

const FOOTER_HIDDEN_EXACT_PATHS = new Set([
  "/",
  "/landing",
  "/account",
  "/sign-in",
  "/signup",
]);

const FOOTER_HIDDEN_PREFIXES = [
  "/account/",
  "/admin",
  "/auth/",
  "/checkout",
];

const MOBILE_BOTTOM_NAV_HIDDEN_EXACT_PATHS = new Set([
  "/",
  "/landing",
  "/sign-in",
  "/signup",
]);

const MOBILE_BOTTOM_NAV_HIDDEN_PREFIXES = [
  "/admin",
  "/auth/",
  "/checkout",
];

const normalizePath = (pathname) => {
  const path = String(pathname || "/");
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
};

const isHiddenByRule = (pathname, exactPaths, prefixes) => {
  const path = normalizePath(pathname);
  if (exactPaths.has(path)) return true;
  return prefixes.some((prefix) => path === prefix || path.startsWith(prefix));
};

export const shouldShowCommerceHeader = (pathname) =>
  !isHiddenByRule(pathname, CUSTOMER_CHROME_HIDDEN_EXACT_PATHS, CUSTOMER_CHROME_HIDDEN_PREFIXES);

export const shouldShowCommerceFooter = (pathname) =>
  !isHiddenByRule(pathname, FOOTER_HIDDEN_EXACT_PATHS, FOOTER_HIDDEN_PREFIXES);

export const shouldShowMobileBottomNav = (pathname) =>
  !isHiddenByRule(pathname, MOBILE_BOTTOM_NAV_HIDDEN_EXACT_PATHS, MOBILE_BOTTOM_NAV_HIDDEN_PREFIXES);
