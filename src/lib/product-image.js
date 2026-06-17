export const PRODUCT_PLACEHOLDER_IMAGE = "/assets/img/product-placeholder.svg";

const LEGACY_BROKEN_IMAGE_PATHS = new Set([
  "/assets/img/product images/tomato-fruit-isolated-transparent-background.png",
  "/assets/img/product%20images/tomato-fruit-isolated-transparent-background.png",
  "assets/img/product images/tomato-fruit-isolated-transparent-background.png",
  "assets/img/product%20images/tomato-fruit-isolated-transparent-background.png",
  "public/assets/img/product images/tomato-fruit-isolated-transparent-background.png",
  "public/assets/img/product%20images/tomato-fruit-isolated-transparent-background.png",
]);

const normalisePath = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed).replace(/\\/g, "/").toLowerCase();
  } catch {
    return trimmed.replace(/\\/g, "/").toLowerCase();
  }
};

export const cleanProductImage = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalised = normalisePath(trimmed);
  for (const brokenPath of LEGACY_BROKEN_IMAGE_PATHS) {
    if (normalised === brokenPath || normalised.endsWith(brokenPath) || normalised.includes(brokenPath)) {
      return "";
    }
  }
  return trimmed;
};

export const resolveProductImage = (...candidates) => {
  for (const candidate of candidates) {
    const cleaned = cleanProductImage(candidate);
    if (cleaned) return cleaned;
  }
  return PRODUCT_PLACEHOLDER_IMAGE;
};
