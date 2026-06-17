export const INVENTORY_LOSS_TYPE_OPTIONS = Object.freeze([
  { value: "spoilage", label: "Spoilage" },
  { value: "expiry", label: "Expiry" },
  { value: "damage", label: "Damage" },
  { value: "quality_rejection", label: "Quality Rejection" },
  { value: "sampling", label: "Sampling" },
  { value: "theft", label: "Theft" },
  { value: "other", label: "Other" },
]);

const LOSS_TYPE_LOOKUP = new Map(
  INVENTORY_LOSS_TYPE_OPTIONS.map((option) => [option.value, option])
);

export const normalizeInventoryLossType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return LOSS_TYPE_LOOKUP.has(normalized) ? normalized : "other";
};

export const isInventoryLossType = (value) =>
  LOSS_TYPE_LOOKUP.has(String(value || "").trim().toLowerCase());

export const getInventoryLossTypeLabel = (value) =>
  LOSS_TYPE_LOOKUP.get(normalizeInventoryLossType(value))?.label || "Other";

export const getInventoryLossMovementReason = (value) => {
  const normalized = normalizeInventoryLossType(value);
  if (normalized === "spoilage" || normalized === "expiry" || normalized === "quality_rejection") {
    return "spoilage";
  }
  return "manual_adjustment";
};

export const INVENTORY_LOSS_FILTER_OPTIONS = Object.freeze([
  { value: "all", label: "All loss types" },
  ...INVENTORY_LOSS_TYPE_OPTIONS,
]);
