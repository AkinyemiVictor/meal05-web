export const SHOPPING_MODE_HOUSEHOLD = "household";
export const SHOPPING_MODE_BUSINESS = "business";
export const SHOPPING_MODE_COOKIE = "meal05_shopping_mode";
export const SHOPPING_MODE_STORAGE_KEY = "meal05_shopping_mode";
export const SHOPPING_MODE_EVENT = "meal05:shopping-mode-changed";

export const normalizeShoppingMode = (value, fallback = SHOPPING_MODE_HOUSEHOLD) => {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === SHOPPING_MODE_BUSINESS) return SHOPPING_MODE_BUSINESS;
  if (mode === SHOPPING_MODE_HOUSEHOLD) return SHOPPING_MODE_HOUSEHOLD;
  return fallback;
};

export const isBusinessMode = (value) =>
  normalizeShoppingMode(value) === SHOPPING_MODE_BUSINESS;

export const withShoppingMode = (url, mode) => {
  const normalized = normalizeShoppingMode(mode);
  const separator = String(url || "").includes("?") ? "&" : "?";
  return `${url}${separator}mode=${encodeURIComponent(normalized)}`;
};
