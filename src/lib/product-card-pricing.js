import { parseNumberValue, pickFirstNumber } from "./number.js";
import { getAvailableCount, resolveStockValueFromRow } from "./stock.js";

const PRICE_FIELDS = [
  "price",
  "unit_price",
  "unitPrice",
  "sale_price",
  "salePrice",
  "selling_price",
  "sellingPrice",
];

const OLD_PRICE_FIELDS = [
  "old_price",
  "oldPrice",
  "compare_at_price",
  "compareAtPrice",
  "list_price",
  "listPrice",
];

const DISCOUNT_FIELDS = [
  "discount",
  "discount_pct",
  "discountPercent",
  "discount_percent",
  "percentage_off",
  "percent_off",
  "percentOff",
];

const isActiveVariant = (variant) =>
  variant?.is_active !== false && variant?.isActive !== false && variant?.active !== false;

const belongsToMarket = (variant, marketId) => {
  const expectedMarketId = String(marketId || "").trim();
  if (!expectedMarketId) return true;
  const variantMarketId = String(variant?.market_id ?? variant?.marketId ?? "").trim();
  return !variantMarketId || variantMarketId === expectedMarketId;
};

const isInStock = (variant) => {
  const stock = resolveStockValueFromRow(variant);
  const count = getAvailableCount(stock);
  if (count != null) return count > 0;
  if (typeof stock === "string") return /\b(in stock|available)\b/i.test(stock);
  return false;
};

const normaliseDiscountPercent = (value) => {
  const numeric = parseNumberValue(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(100, Math.round(numeric <= 1 ? numeric * 100 : numeric));
};

export const resolveVariantPricing = (variant) => {
  const price = pickFirstNumber(variant, PRICE_FIELDS);
  if (!Number.isFinite(price) || price <= 0) return null;

  const rawOldPrice = pickFirstNumber(variant, OLD_PRICE_FIELDS);
  const rawDiscount = pickFirstNumber(variant, DISCOUNT_FIELDS);
  let oldPrice = Number.isFinite(rawOldPrice) && rawOldPrice > price ? rawOldPrice : price;
  let discount = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;

  if (!discount && rawDiscount != null) {
    const percent = normaliseDiscountPercent(rawDiscount);
    if (percent > 0 && percent < 100) {
      discount = percent;
      oldPrice = Math.round(price / (1 - percent / 100));
    }
  }

  return { price, oldPrice, discount };
};

export const selectProductCardVariant = (variants = [], { marketId } = {}) => {
  const valid = (Array.isArray(variants) ? variants : [])
    .filter(isActiveVariant)
    .filter((variant) => belongsToMarket(variant, marketId))
    .map((variant) => ({ variant, pricing: resolveVariantPricing(variant) }))
    .filter((entry) => entry.pricing);

  if (!valid.length) return null;

  const inStock = valid.filter(({ variant }) => isInStock(variant));
  const candidates = inStock.length ? inStock : valid;
  candidates.sort((a, b) => {
    const priceDifference = a.pricing.price - b.pricing.price;
    if (priceDifference) return priceDifference;
    return String(a.variant?.id ?? "").localeCompare(String(b.variant?.id ?? ""), "en", { numeric: true });
  });

  const selected = candidates[0];
  return {
    variant: selected.variant,
    ...selected.pricing,
    inStock: inStock.length > 0,
    variantCount: valid.length,
    hasMultipleOptions: valid.length > 1,
  };
};
