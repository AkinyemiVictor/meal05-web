export const AVAILABILITY_MODES = Object.freeze(["standard", "request", "unavailable"]);
export const SELECTION_MODE_EXACT = "exact_variant";
export const SELECTION_MODE_FLEXIBLE = "flexible_market";
export const SIZE_PREFERENCES = Object.freeze(["best_available", "smaller", "medium", "larger"]);

export const SIZE_PREFERENCE_LABELS = Object.freeze({
  best_available: "Best available",
  smaller: "Smaller pieces",
  medium: "Medium pieces",
  larger: "Larger pieces",
});

export const normalizeAvailabilityMode = (value) =>
  AVAILABILITY_MODES.includes(String(value || "").toLowerCase())
    ? String(value).toLowerCase()
    : "standard";

export const normalizeSelectionMode = (value) =>
  String(value || "").toLowerCase() === SELECTION_MODE_FLEXIBLE
    ? SELECTION_MODE_FLEXIBLE
    : SELECTION_MODE_EXACT;

export const normalizeSizePreference = (value, selectionModel) => {
  if (normalizeSelectionMode(selectionModel) !== SELECTION_MODE_FLEXIBLE) return null;
  const candidate = String(value || "best_available").toLowerCase();
  return SIZE_PREFERENCES.includes(candidate) ? candidate : null;
};

export const isRequestOnlyItem = (item) =>
  normalizeAvailabilityMode(item?.availabilityMode ?? item?.availability_mode) === "request";

export const usesTrackedInventory = (item) =>
  String(item?.inventoryTrackingMode ?? item?.inventory_tracking_mode ?? "tracked") !== "supplier";

