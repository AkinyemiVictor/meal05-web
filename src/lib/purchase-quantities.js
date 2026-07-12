export const PURCHASE_MODE_FIXED = "fixed";
export const PURCHASE_MODE_LOOSE = "loose";

const DECIMAL_SCALE = 1000;
const EPSILON = 0.000001;

const toNumber = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const roundQuantity = (value) => {
  const numeric = toNumber(value, 0);
  return Math.round(numeric * DECIMAL_SCALE) / DECIMAL_SCALE;
};

export const normalizePurchaseMode = (value) =>
  String(value || "").trim().toLowerCase() === PURCHASE_MODE_LOOSE
    ? PURCHASE_MODE_LOOSE
    : PURCHASE_MODE_FIXED;

export const getVariantPurchaseRules = (variant = {}) => {
  const mode = normalizePurchaseMode(variant?.purchase_mode ?? variant?.purchaseMode);
  const minQuantity = toNumber(variant?.min_quantity ?? variant?.minQuantity, null);
  const maxQuantity = toNumber(variant?.max_quantity ?? variant?.maxQuantity, null);
  const stepQuantity = toNumber(variant?.step_quantity ?? variant?.stepQuantity, null);

  return {
    purchaseMode: mode,
    minQuantity:
      minQuantity != null && minQuantity > 0
        ? roundQuantity(minQuantity)
        : mode === PURCHASE_MODE_LOOSE
          ? 1
          : 1,
    maxQuantity: maxQuantity != null && maxQuantity > 0 ? roundQuantity(maxQuantity) : null,
    stepQuantity:
      stepQuantity != null && stepQuantity > 0
        ? roundQuantity(stepQuantity)
        : mode === PURCHASE_MODE_LOOSE
          ? 1
          : 1,
  };
};

export const formatQuantity = (value) => {
  const numeric = roundQuantity(value);
  return numeric.toLocaleString("en-NG", {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 1,
    maximumFractionDigits: 3,
  });
};

export const formatQuantityUnit = (quantity, unit) => {
  const unitLabel = String(unit || "unit").replace(/^per\s+/i, "").trim() || "unit";
  return `${formatQuantity(quantity)} ${unitLabel}`;
};

export const validateVariantQuantity = (variant, requestedQuantity) => {
  const rules = getVariantPurchaseRules(variant);
  const quantity = roundQuantity(requestedQuantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      ok: false,
      quantity,
      rules,
      error: "Enter a valid quantity.",
    };
  }

  if (rules.purchaseMode === PURCHASE_MODE_FIXED && !Number.isInteger(quantity)) {
    return {
      ok: false,
      quantity,
      rules,
      error: "Quantity must be a whole number for this option.",
    };
  }

  if (quantity < rules.minQuantity - EPSILON) {
    return {
      ok: false,
      quantity,
      rules,
      error: `Minimum quantity is ${formatQuantity(rules.minQuantity)}.`,
    };
  }

  if (rules.maxQuantity != null && quantity > rules.maxQuantity + EPSILON) {
    return {
      ok: false,
      quantity,
      rules,
      error: `Maximum quantity is ${formatQuantity(rules.maxQuantity)}.`,
    };
  }

  const step = rules.stepQuantity;
  if (step > 0) {
    const offset = roundQuantity(quantity - rules.minQuantity);
    const scaledOffset = Math.round(offset * DECIMAL_SCALE);
    const scaledStep = Math.round(step * DECIMAL_SCALE);
    if (scaledStep > 0 && scaledOffset % scaledStep !== 0) {
      return {
        ok: false,
        quantity,
        rules,
        error: `Quantity must increase in steps of ${formatQuantity(step)}.`,
      };
    }
  }

  return {
    ok: true,
    quantity,
    rules,
    error: "",
  };
};

export const clampQuantityToRules = (variant, value) => {
  const rules = getVariantPurchaseRules(variant);
  const numeric = toNumber(value, rules.minQuantity);
  const bounded = Math.min(
    rules.maxQuantity != null ? rules.maxQuantity : Number.POSITIVE_INFINITY,
    Math.max(rules.minQuantity, numeric)
  );
  const steps = Math.round((bounded - rules.minQuantity) / rules.stepQuantity);
  return roundQuantity(rules.minQuantity + Math.max(0, steps) * rules.stepQuantity);
};
