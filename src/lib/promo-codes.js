const PROMO_CODE_TYPES = ["percent", "fixed", "delivery"];

const MONEY = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toNullableNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toIsoString = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const isMissingPromoCodeSchemaError = (message) =>
  /relation .*promo_codes.* does not exist|column .*promo_codes.* does not exist|schema cache/i.test(
    String(message || "")
  );

export const normalizePromoCode = (value) => String(value || "").trim().replace(/\s+/g, "").toUpperCase();

const normalizePercentValue = (value) => {
  const numeric = toNumber(value, 0);
  if (numeric <= 0) return 0;
  return numeric <= 1 ? numeric * 100 : numeric;
};

const formatCurrency = (value) => MONEY.format(Math.max(0, Math.round(toNumber(value, 0))));

export const normalizePromoCodeRecord = (row) => {
  if (!row || typeof row !== "object") return null;

  return {
    id: row.id ?? null,
    code: normalizePromoCode(row.code),
    description: String(row.description || "").trim() || null,
    discountType: String(row.discount_type || row.discountType || "").trim().toLowerCase(),
    discountValue: toNumber(row.discount_value ?? row.discountValue, 0),
    minSubtotal: toNullableNumber(row.min_subtotal ?? row.minSubtotal),
    maxDiscount: toNullableNumber(row.max_discount ?? row.maxDiscount),
    startsAt: toIsoString(row.starts_at ?? row.startsAt),
    expiresAt: toIsoString(row.expires_at ?? row.expiresAt),
    usageLimit: toNullableNumber(row.usage_limit ?? row.usageLimit),
    usageCount: toNumber(row.usage_count ?? row.usageCount, 0),
    isActive: row.is_active !== false && row.isActive !== false,
  };
};

const buildPromoMessage = (promo, { itemDiscount = 0, deliveryDiscount = 0 } = {}) => {
  if (!promo) return "";
  if (promo.description) return promo.description;

  if (promo.discountType === "percent") {
    return `${Math.round(normalizePercentValue(promo.discountValue))}% off your order`;
  }
  if (promo.discountType === "fixed") {
    return `${formatCurrency(promo.discountValue)} off your order`;
  }
  if (promo.discountType === "delivery") {
    const effective = deliveryDiscount > 0 ? deliveryDiscount : promo.discountValue;
    return effective > 0 ? `${formatCurrency(effective)} off delivery` : "Free delivery";
  }

  const totalDiscount = Math.max(0, itemDiscount + deliveryDiscount);
  return totalDiscount > 0 ? `${formatCurrency(totalDiscount)} promo discount` : "Promo applied";
};

export const evaluatePromoCode = ({
  promo,
  subtotal = 0,
  itemsCount = 0,
  deliveryFee = 0,
  now = new Date(),
} = {}) => {
  const normalizedPromo = normalizePromoCodeRecord(promo);
  const normalizedSubtotal = Math.max(0, toNumber(subtotal, 0));
  const normalizedItemsCount = Math.max(0, Math.trunc(toNumber(itemsCount, 0)));
  const normalizedDeliveryFee = Math.max(0, toNumber(deliveryFee, 0));
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);

  if (!normalizedPromo?.code) {
    return { ok: false, status: 404, error: "Promo code not found." };
  }

  if (!PROMO_CODE_TYPES.includes(normalizedPromo.discountType)) {
    return { ok: false, status: 409, error: "Promo code configuration is invalid." };
  }

  if (normalizedItemsCount < 1 || normalizedSubtotal <= 0) {
    return { ok: false, status: 409, error: "Add items to your cart before applying a promo code." };
  }

  if (!normalizedPromo.isActive) {
    return { ok: false, status: 409, error: "This promo code is currently inactive.", promo: normalizedPromo };
  }

  const startsAtMs = normalizedPromo.startsAt ? Date.parse(normalizedPromo.startsAt) : Number.NaN;
  if (Number.isFinite(startsAtMs) && startsAtMs > nowMs) {
    return { ok: false, status: 409, error: "This promo code is not active yet.", promo: normalizedPromo };
  }

  const expiresAtMs = normalizedPromo.expiresAt ? Date.parse(normalizedPromo.expiresAt) : Number.NaN;
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
    return { ok: false, status: 409, error: "This promo code has expired.", promo: normalizedPromo };
  }

  if (
    normalizedPromo.usageLimit != null &&
    normalizedPromo.usageLimit > 0 &&
    normalizedPromo.usageCount >= normalizedPromo.usageLimit
  ) {
    return { ok: false, status: 409, error: "This promo code has reached its usage limit.", promo: normalizedPromo };
  }

  if (normalizedPromo.minSubtotal != null && normalizedSubtotal < normalizedPromo.minSubtotal) {
    return {
      ok: false,
      status: 409,
      error: `This promo code activates from ${formatCurrency(normalizedPromo.minSubtotal)} spend.`,
      promo: normalizedPromo,
    };
  }

  let itemDiscount = 0;
  let deliveryDiscount = 0;

  if (normalizedPromo.discountType === "percent") {
    itemDiscount = normalizedSubtotal * (normalizePercentValue(normalizedPromo.discountValue) / 100);
  } else if (normalizedPromo.discountType === "fixed") {
    itemDiscount = normalizedPromo.discountValue;
  } else if (normalizedPromo.discountType === "delivery") {
    const deliveryCap =
      normalizedPromo.discountValue > 0 ? normalizedPromo.discountValue : normalizedDeliveryFee;
    deliveryDiscount = Math.min(normalizedDeliveryFee, deliveryCap);
  }

  if (normalizedPromo.maxDiscount != null) {
    itemDiscount = Math.min(itemDiscount, normalizedPromo.maxDiscount);
  }

  itemDiscount = Math.min(Math.max(0, itemDiscount), normalizedSubtotal);
  deliveryDiscount = Math.min(Math.max(0, deliveryDiscount), normalizedDeliveryFee);
  const totalDiscount = itemDiscount + deliveryDiscount;
  const totalAfterDiscount = Math.max(0, normalizedSubtotal + normalizedDeliveryFee - totalDiscount);

  if (totalDiscount <= 0) {
    return { ok: false, status: 409, error: "This promo code does not apply to the current cart.", promo: normalizedPromo };
  }

  return {
    ok: true,
    status: 200,
    promo: normalizedPromo,
    message: buildPromoMessage(normalizedPromo, { itemDiscount, deliveryDiscount }),
    totals: {
      subtotal: normalizedSubtotal,
      deliveryFee: normalizedDeliveryFee,
      itemDiscount: Math.round(itemDiscount),
      deliveryDiscount: Math.round(deliveryDiscount),
      totalDiscount: Math.round(totalDiscount),
      totalAfterDiscount: Math.round(totalAfterDiscount),
    },
  };
};

export const fetchPromoCodeByCode = async ({ admin, code }) => {
  const normalizedCode = normalizePromoCode(code);
  if (!normalizedCode) return { promo: null, error: null };

  const result = await admin
    .from("promo_codes")
    .select(
      "id, code, description, discount_type, discount_value, min_subtotal, max_discount, starts_at, expires_at, usage_limit, usage_count, is_active"
    )
    .eq("code", normalizedCode)
    .maybeSingle();

  if (result.error) {
    return { promo: null, error: result.error };
  }

  return {
    promo: normalizePromoCodeRecord(result.data),
    error: null,
  };
};

export const validatePromoCode = async ({
  admin,
  code,
  subtotal = 0,
  itemsCount = 0,
  deliveryFee = 0,
  now = new Date(),
} = {}) => {
  const normalizedCode = normalizePromoCode(code);
  if (!normalizedCode) {
    return { ok: false, status: 400, error: "Enter a promo code." };
  }

  const { promo, error } = await fetchPromoCodeByCode({ admin, code: normalizedCode });
  if (error) throw error;

  return evaluatePromoCode({
    promo,
    subtotal,
    itemsCount,
    deliveryFee,
    now,
  });
};

const promoCodes = {
  PROMO_CODE_TYPES,
  normalizePromoCode,
  normalizePromoCodeRecord,
  evaluatePromoCode,
  fetchPromoCodeByCode,
  validatePromoCode,
  isMissingPromoCodeSchemaError,
};

export default promoCodes;
