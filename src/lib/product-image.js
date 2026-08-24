export const PRODUCT_PLACEHOLDER_IMAGE = "/assets/img/product-placeholder.svg";

const LEGACY_BROKEN_IMAGE_PATHS = new Set([
  "/assets/img/product images/tomato-fruit-isolated-transparent-background.png",
  "/assets/img/product%20images/tomato-fruit-isolated-transparent-background.png",
  "assets/img/product images/tomato-fruit-isolated-transparent-background.png",
  "assets/img/product%20images/tomato-fruit-isolated-transparent-background.png",
  "public/assets/img/product images/tomato-fruit-isolated-transparent-background.png",
  "public/assets/img/product%20images/tomato-fruit-isolated-transparent-background.png",
]);

const PRODUCT_ASSET_PATH = "/api/product-assets/";
// Added once to every Meal05 asset URL so pages carrying an older ?v= snapshot
// move onto the refreshed cache policy immediately. The original version query is
// preserved, so newly-normalised assets still keep their own version identity.
const PRODUCT_ASSET_REFRESH_KEY = "m5asset";
const PRODUCT_ASSET_REFRESH_VALUE = "20260819";
const NEXT_IMAGE_PATH = "/_next/image";

const unwrapNextImageUrl = (value) => {
  let current = String(value || "").trim();
  if (!current) return "";

  // Cart/localStorage snapshots can outlive a deployment. If one contains an
  // already-optimised Next.js URL, passing it to <Image> again nests the image
  // optimiser and can produce a 404. Peel off a few nested optimiser layers and
  // keep the underlying canonical product source instead.
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      const parsed = new URL(current, "https://meal05.invalid");
      if (parsed.pathname !== NEXT_IMAGE_PATH) break;
      const source = String(parsed.searchParams.get("url") || "").trim();
      if (!source || source === current) break;
      current = source;
    } catch {
      break;
    }
  }

  return current;
};

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

const refreshProductAssetUrl = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed || !trimmed.toLowerCase().includes(PRODUCT_ASSET_PATH)) return trimmed;

  const isAbsolute = /^https?:\/\//i.test(trimmed);
  try {
    const parsed = new URL(trimmed, "https://meal05.invalid");
    if (!parsed.pathname.toLowerCase().startsWith(PRODUCT_ASSET_PATH)) return trimmed;
    parsed.searchParams.set(PRODUCT_ASSET_REFRESH_KEY, PRODUCT_ASSET_REFRESH_VALUE);

    if (!isAbsolute) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    const separator = trimmed.includes("?") ? "&" : "?";
    if (trimmed.includes(`${PRODUCT_ASSET_REFRESH_KEY}=`)) return trimmed;
    return `${trimmed}${separator}${PRODUCT_ASSET_REFRESH_KEY}=${PRODUCT_ASSET_REFRESH_VALUE}`;
  }
};

export const cleanProductImage = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = unwrapNextImageUrl(value);
  if (!trimmed) return "";
  const normalised = normalisePath(trimmed);
  for (const brokenPath of LEGACY_BROKEN_IMAGE_PATHS) {
    if (normalised === brokenPath || normalised.endsWith(brokenPath) || normalised.includes(brokenPath)) {
      return "";
    }
  }
  return refreshProductAssetUrl(trimmed);
};

export const resolveProductImage = (...candidates) => {
  for (const candidate of candidates) {
    const cleaned = cleanProductImage(candidate);
    if (cleaned) return cleaned;
  }
  return PRODUCT_PLACEHOLDER_IMAGE;
};