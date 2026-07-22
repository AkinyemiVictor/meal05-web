export const PURCHASE_MODE_FIXED = "fixed";
export const PURCHASE_MODE_LOOSE = "loose";

const MAX_DECIMAL_PLACES = 3;

const toNumber = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export function decimalPlaces(value) {
  const text = String(value ?? "");
  if (!text || /e/i.test(text)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const expanded = numeric.toFixed(MAX_DECIMAL_PLACES).replace(/0+$/, "");
    return decimalPlaces(expanded);
  }
  const [, decimals = ""] = text.split(".");
  return decimals.replace(/0+$/, "").length;
}

const scaleFor = (...values) => {
  const places = Math.min(MAX_DECIMAL_PLACES, Math.max(0, ...values.map(decimalPlaces)));
  return 10 ** places;
};

export function roundQuantity(value) {
  const numeric = toNumber(value, 0);
  const scale = 10 ** MAX_DECIMAL_PLACES;
  return Math.round(numeric * scale) / scale;
}

export function normalizePurchaseMode(value) {
  return String(value || "").trim().toLowerCase() === PURCHASE_MODE_LOOSE
    ? PURCHASE_MODE_LOOSE
    : PURCHASE_MODE_FIXED;
}

export function getVariantPurchaseRules(variant = {}) {
  const purchaseMode = normalizePurchaseMode(variant?.purchase_mode ?? variant?.purchaseMode);
  const minQuantity = toNumber(variant?.min_quantity ?? variant?.minQuantity, 1);
  const stepQuantity = toNumber(variant?.step_quantity ?? variant?.stepQuantity, 1);
  const maxQuantity = toNumber(variant?.max_quantity ?? variant?.maxQuantity, null);
  const baseUnit = String(variant?.base_unit ?? variant?.baseUnit ?? "").trim();
  const baseQuantity = toNumber(variant?.base_quantity ?? variant?.baseQuantity, null);

  return {
    purchaseMode,
    minQuantity: minQuantity > 0 ? roundQuantity(minQuantity) : 1,
    stepQuantity: stepQuantity > 0 ? roundQuantity(stepQuantity) : 1,
    maxQuantity: maxQuantity != null && maxQuantity > 0 ? roundQuantity(maxQuantity) : null,
    baseUnit,
    baseQuantity: baseQuantity != null && baseQuantity > 0 ? roundQuantity(baseQuantity) : null,
  };
}

export function isStepAligned(quantity, min, step, epsilon = 1e-9) {
  const numericQuantity = Number(quantity);
  const numericMin = Number(min);
  const numericStep = Number(step);
  if (![numericQuantity, numericMin, numericStep].every(Number.isFinite) || numericStep <= 0) return false;
  const scale = scaleFor(numericQuantity, numericMin, numericStep);
  const offset = Math.round((numericQuantity - numericMin) * scale);
  const scaledStep = Math.round(numericStep * scale);
  if (scaledStep <= 0) return false;
  const remainder = Math.abs(offset % scaledStep);
  return remainder <= epsilon * scale || Math.abs(remainder - scaledStep) <= epsilon * scale;
}

export function clampQuantity(quantity, min, max) {
  const numeric = toNumber(quantity, min);
  const lower = toNumber(min, 1);
  const upper = toNumber(max, null);
  return roundQuantity(Math.min(upper == null ? Number.POSITIVE_INFINITY : upper, Math.max(lower, numeric)));
}

export function snapQuantity(quantity, min, step, max) {
  const lower = toNumber(min, 1);
  const increment = toNumber(step, 1);
  const bounded = clampQuantity(quantity, lower, max);
  const steps = Math.round((bounded - lower) / increment);
  return clampQuantity(lower + Math.max(0, steps) * increment, lower, max);
}

export function formatQuantity(quantity, unit = "") {
  const numeric = roundQuantity(quantity);
  const formatted = numeric.toLocaleString("en-NG", {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 1,
    maximumFractionDigits: MAX_DECIMAL_PLACES,
  });
  const suffix = String(unit || "").replace(/^per\s+/i, "").trim();
  return suffix ? `${formatted} ${suffix}` : formatted;
}

export function formatQuantityUnit(quantity, unit) {
  return formatQuantity(quantity, unit || "unit");
}

const invalid = (quantity, rules, error) => ({ ok: false, quantity, rules, error });

export function validateVariantQuantity(variant, requestedQuantity) {
  const rules = getVariantPurchaseRules(variant);
  const quantity = roundQuantity(requestedQuantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return invalid(quantity, rules, "Quantity must be positive");
  }
  if (quantity < rules.minQuantity) {
    return invalid(quantity, rules, `Minimum is ${formatQuantity(rules.minQuantity)}`);
  }
  if (rules.maxQuantity != null && quantity > rules.maxQuantity) {
    return invalid(quantity, rules, `Maximum is ${formatQuantity(rules.maxQuantity)}`);
  }
  if (!isStepAligned(quantity, rules.minQuantity, rules.stepQuantity)) {
    return invalid(quantity, rules, `Quantity must increase by ${formatQuantity(rules.stepQuantity)}`);
  }
  if (rules.purchaseMode === PURCHASE_MODE_FIXED && !Number.isInteger(quantity)) {
    return invalid(quantity, rules, "Fixed packs must use whole-number quantities");
  }

  return { ok: true, quantity, rules, error: "" };
}

export function clampQuantityToRules(variant, value) {
  const rules = getVariantPurchaseRules(variant);
  return snapQuantity(value, rules.minQuantity, rules.stepQuantity, rules.maxQuantity);
}
