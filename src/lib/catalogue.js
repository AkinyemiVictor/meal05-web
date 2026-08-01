import { formatMoney } from "@/lib/region";
import { getAvailableCount } from "@/lib/stock";
import { resolveProductImage } from "@/lib/product-image";
import { normalizePromoEnabled, normalizePromoText, parsePromoExpiry } from "@/lib/product-promo";

export const formatProductPrice = (value, unit) => {
  const formattedPrice = formatMoney(value);
  const normalisedUnit = typeof unit === "string" ? unit.trim() : "";
  return normalisedUnit ? `${formattedPrice}/${normalisedUnit}` : formattedPrice;
};

export const resolveStockClass = (stockText, { lowThreshold = 5 } = {}) => {
  if (stockText == null || stockText === "") return "";
  if (typeof stockText === "boolean") return stockText ? "is-available" : "is-unavailable";
  const count = getAvailableCount(stockText);
  if (count === 0) return "is-unavailable";
  if (Number.isFinite(count)) {
    if (count <= lowThreshold) return "is-limited";
    return "is-available";
  }
  const lowered = String(stockText).toLowerCase();
  if (lowered.includes("almost") || lowered.includes("low") || lowered.includes("limited")) {
    return "is-limited";
  }
  return "is-available";
};

export const getStockLabel = (stock, { lowThreshold = 5 } = {}) => {
  if (stock == null || stock === "") return "";
  if (typeof stock === "boolean") return stock ? "In stock" : "Out of stock";
  const count = getAvailableCount(stock);
  if (count === 0) return "Out of stock";
  if (Number.isFinite(count)) {
    if (count <= lowThreshold) return `Only ${count} left in stock`;
    return "In stock";
  }
  return String(stock);
};

const normaliseDiscountPercent = (value) => {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]+/g, ""));
  if (!Number.isFinite(numeric)) return null;
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  if (!Number.isFinite(percent)) return null;
  if (percent <= 0) return 0;
  return Math.min(100, Math.round(percent));
};

const resolveOldPrice = (price, discountPercent) => {
  if (!Number.isFinite(price) || price <= 0) return price;
  if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100) return price;
  const computed = price / (1 - discountPercent / 100);
  return Number.isFinite(computed) ? Math.round(computed) : price;
};

const canonicaliseCategorySlug = (raw) => {
  const withSeparators = String(raw || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const lowered = withSeparators.toLowerCase();
  const connectors = lowered.replace(/\band\b/g, " ").replace(/&/g, " ");
  const base = connectors
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const map = new Map([
    ["meat-n-poultry", "meat-poultry"],
    ["fish-n-seafood", "fish-seafood"],
    ["fish-sea-food", "fish-seafood"],
    ["grains-n-cereals", "grains-cereals"],
    ["dairy-n-eggs", "dairy-eggs"],
    ["tubers-n-legumes", "tubers-legumes"],
    ["spices-n-condiments", "spices-condiments"],
    ["drinks-n-beverages", "drinks-beverages"],
    ["snacks-n-pastries", "snacks-pastries"],
    ["snackes-pasteries", "snacks-pastries"],
    ["oil-n-cooking-essentials", "oil-cooking-essentials"],
  ]);
  return map.get(base) || base || "uncategorised";
};

export const normaliseProductCatalogue = (catalogue) => {
  const index = new Map();
  const ordered = [];

  if (!catalogue || typeof catalogue !== "object") {
    return { index, ordered };
  }

  Object.values(catalogue).forEach((collection) => {
    if (!Array.isArray(collection)) return;

    collection.forEach((item) => {
      if (!item || typeof item !== "object") return;

      const variant =
        Array.isArray(item.variations) && item.variations.length
          ?
              item.variations.find((entry) => {
                if (!entry || typeof entry !== "object") return false;
                return resolveStockClass(entry.stock) !== "is-unavailable";
              }) || item.variations[0]
          : item;

      const price = variant.price ?? item.price ?? 0;
      let oldPrice = variant.oldPrice ?? item.oldPrice ?? price;
      let discount = oldPrice > price ? Math.round(((oldPrice - price) / (oldPrice || 1)) * 100) : 0;
      const rawDiscount = variant.discount ?? item.discount ?? null;

      if (!discount && rawDiscount != null) {
        const pct = normaliseDiscountPercent(rawDiscount);
        if (pct && pct > 0) {
          discount = pct;
          if (!(oldPrice > price)) {
            const computedOldPrice = resolveOldPrice(price, pct);
            if (computedOldPrice > price) {
              oldPrice = computedOldPrice;
            }
          }
        }
      }

      if (!Number.isFinite(oldPrice) || oldPrice <= 0) oldPrice = price;
      if (oldPrice < price) oldPrice = price;

      const toSlug = (value) => canonicaliseCategorySlug(value);

      const normalised = {
        id: item.id != null ? String(item.id) : "",
        variantId:
          variant.variantId ??
          variant.variationId ??
          item.variantId ??
          item.variationId ??
          null,
        name: item.name || "Fresh produce",
        image: resolveProductImage(variant.image, item.image),
        price,
        oldPrice,
        unit: variant.unit || item.unit || "",
        stock: variant.stock ?? item.stock ?? "",
        inSeason:
          typeof item.inSeason === "boolean"
            ? item.inSeason
            : variant.inSeason ?? true,
        discount,
        category: item.category || variant.category || "",
        categorySlug: toSlug(item.category || variant.category || "uncategorised"),
        variantName: variant.variantName || item.variantName || "",
        purchaseMode: variant.purchaseMode ?? variant.purchase_mode ?? item.purchaseMode ?? item.purchase_mode,
        purchase_mode: variant.purchase_mode ?? variant.purchaseMode ?? item.purchase_mode ?? item.purchaseMode,
        minQuantity: variant.minQuantity ?? variant.min_quantity ?? item.minQuantity ?? item.min_quantity,
        min_quantity: variant.min_quantity ?? variant.minQuantity ?? item.min_quantity ?? item.minQuantity,
        maxQuantity: variant.maxQuantity ?? variant.max_quantity ?? item.maxQuantity ?? item.max_quantity,
        max_quantity: variant.max_quantity ?? variant.maxQuantity ?? item.max_quantity ?? item.maxQuantity,
        stepQuantity: variant.stepQuantity ?? variant.step_quantity ?? item.stepQuantity ?? item.step_quantity,
        step_quantity: variant.step_quantity ?? variant.stepQuantity ?? item.step_quantity ?? item.stepQuantity,
        baseUnit: variant.baseUnit ?? variant.base_unit ?? item.baseUnit ?? item.base_unit,
        base_unit: variant.base_unit ?? variant.baseUnit ?? item.base_unit ?? item.baseUnit,
        baseQuantity: variant.baseQuantity ?? variant.base_quantity ?? item.baseQuantity ?? item.base_quantity,
        base_quantity: variant.base_quantity ?? variant.baseQuantity ?? item.base_quantity ?? item.baseQuantity,
        promoTagEnabled: normalizePromoEnabled(
          item.promoTagEnabled ?? item.promo_tag_enabled ?? item.promoEnabled ?? item.promo_enabled
        ),
        promoTagText: normalizePromoText(item.promoTagText ?? item.promo_tag_text ?? item.promoText),
        tags: Array.isArray(item.tags) ? item.tags : Array.isArray(item.keywords) ? item.keywords : [],
        collectionSlug: item.collectionSlug || item.collection_slug || "",
        isPopular: Boolean(item.isPopular || item.is_popular || item.isBestseller || item.is_bestseller),
        isChefChoice: Boolean(item.isChefChoice || item.is_chef_choice),
        isUnder15m: Boolean(item.isUnder15m || item.is_under_15m || item.isUnder15Minutes),
        isBundleEligible: Boolean(item.isBundleEligible || item.is_bundle_eligible),
        promoTagExpiresAt: parsePromoExpiry(
          item.promoTagExpiresAt ?? item.promo_tag_expires_at ?? item.promoExpiresAt
        ),
      };

      if (!normalised.id || index.has(normalised.id)) return;

      index.set(normalised.id, normalised);
      ordered.push(normalised);
    });
  });

  return { index, ordered };
};

const parseProductId = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const pickMostPopularProducts = (list, excludeIds = new Set(), limit = 6) =>
  list
    .filter((product) => !excludeIds.has(product.id))
    .map((product) => {
      const discountScore = Number(product.discount) || 0;
      const seasonScore = product.inSeason ? 5 : 0;
      const stockText = product?.stock;
      const stockClass = resolveStockClass(stockText);
      const availabilityScore = stockClass === "is-unavailable" ? 0 : stockText != null && stockText !== "" ? 3 : 0;

      return {
        product,
        score: discountScore * 2 + seasonScore + availabilityScore,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.product.name.localeCompare(b.product.name);
    })
    .slice(0, limit)
    .map((entry) => entry.product);

export const pickNewestProducts = (list, excludeIds = new Set(), limit = 6) =>
  list
    .filter((product) => !excludeIds.has(product.id))
    .slice()
    .sort((a, b) => parseProductId(b.id) - parseProductId(a.id))
    .slice(0, limit);

export const pickInSeasonProducts = (list, excludeIds = new Set(), limit = 6) =>
  list.filter((product) => product.inSeason && !excludeIds.has(product.id)).slice(0, limit);

const catalogueUtils = {
  formatProductPrice,
  resolveStockClass,
  getStockLabel,
  normaliseProductCatalogue,
  pickMostPopularProducts,
  pickNewestProducts,
  pickInSeasonProducts,
};

export default catalogueUtils;
