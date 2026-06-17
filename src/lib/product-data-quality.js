export const PRODUCT_DATA_QUALITY_ISSUES = [
  { value: "missing_image", label: "Missing Image" },
  { value: "missing_unit", label: "Missing Unit" },
  { value: "missing_packaging_type", label: "Missing Packaging Type" },
  { value: "no_active_variant", label: "No Active Variant" },
  { value: "no_price", label: "No Price" },
  { value: "no_season_value", label: "No Season Value" },
  { value: "no_promo_state", label: "No Promo State" },
];

export const PRODUCT_DATA_QUALITY_FILTER_OPTIONS = [
  { value: "all", label: "All Issues" },
  ...PRODUCT_DATA_QUALITY_ISSUES,
];

const ISSUE_BY_VALUE = new Map(PRODUCT_DATA_QUALITY_ISSUES.map((issue) => [issue.value, issue]));

export const normalizeProductDataQualityFilter = (value) => {
  const normalized = String(value || "all").trim().toLowerCase();
  return PRODUCT_DATA_QUALITY_FILTER_OPTIONS.some((option) => option.value === normalized) ? normalized : "all";
};

export const getProductDataQualityIssueLabel = (value) =>
  ISSUE_BY_VALUE.get(String(value || "").trim().toLowerCase())?.label || "Issue";

export const matchesProductDataQualityFilter = (record, filter = "all") => {
  const normalized = normalizeProductDataQualityFilter(filter);
  if (normalized === "all") return true;
  const issues = Array.isArray(record?.issueCodes) ? record.issueCodes : [];
  return issues.includes(normalized);
};
