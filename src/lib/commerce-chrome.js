const CHROME_HIDDEN_EXACT_PATHS = new Set([
  "/sign-in",
  "/signup",
]);

const CHROME_HIDDEN_PREFIXES = [
  "/admin",
  "/auth/",
  "/checkout",
];

export const shouldShowCommerceChrome = (pathname) => {
  const path = String(pathname || "/");
  if (CHROME_HIDDEN_EXACT_PATHS.has(path)) return false;
  return !CHROME_HIDDEN_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
};
