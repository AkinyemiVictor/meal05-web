import { formatQuantity } from "@/lib/product-quantity";

export const DEFAULT_ORDER_CAPACITY_SETTINGS = {
  maxWeightKg: 50,
  maxLiquidLiters: 25,
};

const roundCapacity = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

const numberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const normalizeUnit = (unit) => String(unit || "").trim().toLowerCase();

const toKg = (value, unit) => {
  const numeric = numberOrNull(value);
  if (numeric == null) return null;
  const normalized = normalizeUnit(unit);
  if (["kg", "kilogram", "kilograms"].includes(normalized)) return numeric;
  if (["g", "gram", "grams"].includes(normalized)) return numeric / 1000;
  return null;
};

const toLiters = (value, unit) => {
  const numeric = numberOrNull(value);
  if (numeric == null) return null;
  const normalized = normalizeUnit(unit);
  if (["l", "liter", "liters", "litre", "litres"].includes(normalized)) return numeric;
  if (["ml", "milliliter", "milliliters", "millilitre", "millilitres"].includes(normalized)) return numeric / 1000;
  return null;
};

export function calculateOrderCapacity(lines = [], settings = DEFAULT_ORDER_CAPACITY_SETTINGS) {
  let weightKg = 0;
  let liquidLiters = 0;
  const unknownLines = [];

  for (const line of Array.isArray(lines) ? lines : []) {
    const quantity = Number(line?.quantity ?? line?.orderCount ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const baseQuantity = numberOrNull(line?.base_quantity ?? line?.baseQuantity);
    const baseUnit = normalizeUnit(line?.base_unit ?? line?.baseUnit);
    let known = false;

    if (baseQuantity != null && ["kg", "kilogram", "kilograms", "g", "gram", "grams"].includes(baseUnit)) {
      weightKg += (toKg(baseQuantity, baseUnit) || 0) * quantity;
      known = true;
    } else if (baseQuantity != null && ["l", "liter", "liters", "litre", "litres", "ml", "milliliter", "milliliters", "millilitre", "millilitres"].includes(baseUnit)) {
      liquidLiters += (toLiters(baseQuantity, baseUnit) || 0) * quantity;
      known = true;
    } else {
      const weightMax = line?.weight_max ?? line?.weightMax;
      const weightUnit = line?.weight_unit ?? line?.weightUnit;
      const fixedPieceWeightKg = toKg(weightMax, weightUnit);
      if (fixedPieceWeightKg != null) {
        weightKg += fixedPieceWeightKg * quantity;
        known = true;
      }
    }

    if (!known) {
      unknownLines.push({
        productId: String(line?.product_id ?? line?.productId ?? ""),
        variantId: String(line?.variant_id ?? line?.variantId ?? line?.id ?? ""),
        name: String(line?.product_name ?? line?.productName ?? line?.name ?? "Item"),
      });
    }
  }

  weightKg = roundCapacity(weightKg);
  liquidLiters = roundCapacity(liquidLiters);
  const maxWeightKg = Number(settings?.maxWeightKg ?? DEFAULT_ORDER_CAPACITY_SETTINGS.maxWeightKg);
  const maxLiquidLiters = Number(settings?.maxLiquidLiters ?? DEFAULT_ORDER_CAPACITY_SETTINGS.maxLiquidLiters);
  const reasons = [];
  if (weightKg > maxWeightKg) reasons.push("weight");
  if (liquidLiters > maxLiquidLiters) reasons.push("liquid");

  return {
    weightKg,
    liquidLiters,
    unknownLines,
    requiresBulk: reasons.length > 0,
    reasons,
  };
}

export function formatCapacitySummary(capacity = {}) {
  const parts = [];
  if (Number(capacity.weightKg) > 0) parts.push(formatQuantity(capacity.weightKg, "kg"));
  if (Number(capacity.liquidLiters) > 0) parts.push(formatQuantity(capacity.liquidLiters, "L"));
  return parts.length ? parts.join(" + ") : "not estimated";
}
