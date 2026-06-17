import { parseNumberValue } from "@/lib/number";

const OUT_OF_STOCK_PATTERN = /(out[\s_-]*of[\s_-]*stock|outofstock|sold[\s_-]*out|unavailable|no stock|not available|oos)/i;

const toCount = (value) => {
  const numeric = parseNumberValue(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.floor(numeric));
};

const isOutOfStockLabel = (value) => OUT_OF_STOCK_PATTERN.test(String(value || "").toLowerCase());

export const getAvailableCount = (stock) => {
  if (typeof stock === "number") {
    return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : null;
  }
  if (typeof stock === "boolean") {
    return stock ? null : 0;
  }
  if (typeof stock === "string") {
    const trimmed = stock.trim();
    if (!trimmed) return null;
    if (isOutOfStockLabel(trimmed)) return 0;
    const numeric = toCount(trimmed);
    if (numeric != null) return numeric;
  }
  return null; // unknown
};

export const normaliseStockValue = (stock) => {
  if (typeof stock === "number") {
    return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : "";
  }
  if (typeof stock === "boolean") {
    return stock ? "In stock" : 0;
  }
  if (typeof stock === "string") {
    const trimmed = stock.trim();
    if (!trimmed) return "";
    if (isOutOfStockLabel(trimmed)) return 0;
    const numeric = toCount(trimmed);
    if (numeric != null) return numeric;
    return trimmed;
  }
  return stock ?? "";
};

export const resolveStockValueFromRow = (row) => {
  if (!row || typeof row !== "object") return normaliseStockValue(row);

  const numericFields = [
    "stock_count",
    "stockCount",
    "inventory_count",
    "inventoryCount",
    "inventory_level",
    "inventoryLevel",
    "inventory",
    "qty",
    "quantity",
    "available",
    "available_quantity",
    "availableQuantity",
    "available_qty",
    "availableQty",
    "available_stock",
    "availableStock",
    "stock_qty",
    "stockQty",
    "stock_on_hand",
    "stockOnHand",
    "in_stock_count",
    "inStockCount",
  ];

  for (const key of numericFields) {
    if (row[key] == null || row[key] === "") continue;
    const numeric = toCount(row[key]);
    if (numeric != null) return numeric;
  }

  const booleanFields = [
    "in_stock",
    "inStock",
    "is_in_stock",
    "isInStock",
    "is_available",
    "isAvailable",
    "is_available_for_sale",
    "isAvailableForSale",
    "available",
  ];

  for (const key of booleanFields) {
    if (typeof row[key] !== "boolean") continue;
    return row[key] ? "In stock" : 0;
  }

  const labelFields = [
    "stock",
    "stock_status",
    "stockStatus",
    "availability",
    "availability_status",
    "availabilityStatus",
  ];

  for (const key of labelFields) {
    if (row[key] == null || row[key] === "") continue;
    return normaliseStockValue(row[key]);
  }

  return "";
};

export const getStockBadge = (stock, threshold = 5) => {
  const count = getAvailableCount(stock);
  if (count === 0) return { tone: "out", label: "Out of stock" };
  if (Number.isFinite(count) && count > 0 && count <= threshold) {
    return { tone: "low", label: `Only ${count} left` };
  }
  return null;
};

const stockApi = { getAvailableCount, getStockBadge, normaliseStockValue, resolveStockValueFromRow };

export default stockApi;
