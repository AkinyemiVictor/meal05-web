export const PRODUCT_MERCHANDISING_FLAGS = [
  { field: "is_featured", camelKey: "isFeatured", value: "featured", label: "Featured" },
  { field: "is_hidden", camelKey: "isHidden", value: "hidden", label: "Hidden" },
  { field: "is_bestseller", camelKey: "isBestseller", value: "bestseller", label: "Bestseller" },
  { field: "is_new_arrival", camelKey: "isNewArrival", value: "new_arrival", label: "New Arrival" },
  { field: "is_homepage_pick", camelKey: "isHomepagePick", value: "homepage_pick", label: "Homepage Pick" },
  { field: "is_chef_choice", camelKey: "isChefChoice", value: "chef_choice", label: "Chef Choice" },
  { field: "is_bundle_eligible", camelKey: "isBundleEligible", value: "bundle_eligible", label: "Bundle Eligible" },
];

export const PRODUCT_MERCHANDISING_SELECT_FIELDS = PRODUCT_MERCHANDISING_FLAGS.map((flag) => flag.field).join(", ");

export const PRODUCT_MERCHANDISING_FILTER_OPTIONS = [
  { value: "all", label: "All Products" },
  { value: "flagged", label: "Any Flag" },
  ...PRODUCT_MERCHANDISING_FLAGS.map((flag) => ({ value: flag.value, label: flag.label })),
];

const FLAG_BY_VALUE = new Map(PRODUCT_MERCHANDISING_FLAGS.map((flag) => [flag.value, flag]));

export const normalizeMerchandisingBoolean = (value) =>
  value === true || value === 1 || String(value || "").trim().toLowerCase() === "true";

export const normalizeProductMerchandisingFilter = (value) => {
  const normalized = String(value || "all").trim().toLowerCase();
  return PRODUCT_MERCHANDISING_FILTER_OPTIONS.some((option) => option.value === normalized) ? normalized : "all";
};

export const getProductMerchandisingFlagLabel = (value) => FLAG_BY_VALUE.get(String(value || "").trim().toLowerCase())?.label || "Flag";

export const normalizeProductMerchandisingRecord = (row) => {
  const safeRow = row && typeof row === "object" ? row : {};
  const activeFlags = [];
  const activeFlagLabels = [];
  const normalized = {};

  PRODUCT_MERCHANDISING_FLAGS.forEach((flag) => {
    const enabled = normalizeMerchandisingBoolean(safeRow?.[flag.field] ?? safeRow?.[flag.camelKey]);
    normalized[flag.field] = enabled;
    normalized[flag.camelKey] = enabled;
    if (enabled) {
      activeFlags.push(flag.value);
      activeFlagLabels.push(flag.label);
    }
  });

  return {
    ...normalized,
    activeFlags,
    activeFlagLabels,
    hasAnyMerchandisingFlag: activeFlags.length > 0,
  };
};

export const matchesProductMerchandisingFilter = (record, filter = "all") => {
  const normalizedFilter = normalizeProductMerchandisingFilter(filter);
  if (normalizedFilter === "all") return true;
  if (normalizedFilter === "flagged") return Boolean(record?.hasAnyMerchandisingFlag);
  const flag = FLAG_BY_VALUE.get(normalizedFilter);
  return flag ? normalizeMerchandisingBoolean(record?.[flag.field] ?? record?.[flag.camelKey]) : true;
};
