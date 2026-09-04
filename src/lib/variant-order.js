const finiteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const text = (value) => String(value ?? "").trim().toLowerCase();

const variantId = (variant) => finiteNumber(variant?.variationId ?? variant?.id) ?? Number.MAX_SAFE_INTEGER;

export const compareVariantsBySize = (left, right) => {
  const leftQuantity = finiteNumber(left?.baseQuantity ?? left?.base_quantity);
  const rightQuantity = finiteNumber(right?.baseQuantity ?? right?.base_quantity);
  const leftUnit = text(left?.baseUnit ?? left?.base_unit);
  const rightUnit = text(right?.baseUnit ?? right?.base_unit);

  if (leftUnit && leftUnit === rightUnit && leftQuantity != null && rightQuantity != null) {
    const quantityDifference = leftQuantity - rightQuantity;
    if (quantityDifference) return quantityDifference;
  }

  // Total option price is a reliable fallback when quantities use different
  // units (for example, fingers versus a whole bunch of plantain).
  const leftPrice = finiteNumber(left?.price);
  const rightPrice = finiteNumber(right?.price);
  if (leftPrice != null && rightPrice != null) {
    const priceDifference = leftPrice - rightPrice;
    if (priceDifference) return priceDifference;
  }

  if (leftQuantity != null && rightQuantity != null) {
    const quantityDifference = leftQuantity - rightQuantity;
    if (quantityDifference) return quantityDifference;
  }

  return variantId(left) - variantId(right);
};

export const sortVariantsBySize = (variants = []) =>
  [...(Array.isArray(variants) ? variants : [])].sort(compareVariantsBySize);
