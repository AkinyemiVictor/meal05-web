export const PROCUREMENT_STANDARD = "standard";
export const PROCUREMENT_TAG = "tag";
export const TAG_PURCHASE_DUAL = "dual";
export const TAG_PURCHASE_ONLY = "tag_only";

export const normalizeTagPurchaseMode = (value) =>
  String(value || "").trim().toLowerCase() === TAG_PURCHASE_ONLY
    ? TAG_PURCHASE_ONLY
    : TAG_PURCHASE_DUAL;

export const normalizeProcurementMode = (value) =>
  String(value || "").trim().toLowerCase() === PROCUREMENT_TAG
    ? PROCUREMENT_TAG
    : PROCUREMENT_STANDARD;

export const isTagCartItem = (item) =>
  normalizeProcurementMode(item?.procurementMode ?? item?.procurement_mode) === PROCUREMENT_TAG;

export const getTagBatchId = (item) =>
  String(item?.tagBatchId ?? item?.tag_batch_id ?? item?.tagBatch?.id ?? "").trim();

export const getTagBatchForVariant = (product, variant) => {
  const variantId = String(
    variant?.variationId ?? variant?.variantId ?? variant?.id ?? product?.variantId ?? ""
  ).trim();
  if (!variantId) return null;
  const candidates = [variant?.tagBatch, product?.tagBatch].filter(Boolean);
  return candidates.find((batch) => String(batch?.variantId ?? batch?.variant_id ?? "") === variantId) || null;
};

export const getCartProcurementConflict = (items, incoming) => {
  const current = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!current.length) return null;
  const incomingMode = normalizeProcurementMode(incoming?.procurementMode ?? incoming?.procurement_mode);
  const existingModes = new Set(current.map((item) => normalizeProcurementMode(item?.procurementMode ?? item?.procurement_mode)));
  if (existingModes.size > 1 || !existingModes.has(incomingMode)) {
    return incomingMode === PROCUREMENT_TAG
      ? "Your cart already contains standard items. Checkout or clear it before joining a Tag Buy."
      : "Your cart already contains a Tag Buy. Checkout or clear it before adding standard items.";
  }
  if (incomingMode === PROCUREMENT_TAG) {
    const incomingBatchId = getTagBatchId(incoming);
    const existingBatchIds = new Set(current.map(getTagBatchId).filter(Boolean));
    if (!incomingBatchId || existingBatchIds.size !== 1 || !existingBatchIds.has(incomingBatchId)) {
      return "Only one Tag Buy can be checked out at a time. Finish or clear the current Tag Buy first.";
    }
  }
  return null;
};

export const formatTagDeadline = (value, locale = "en-NG") => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Deadline pending";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export const buildTagCartMetadata = (batch) => batch?.id ? {
  procurementMode: PROCUREMENT_TAG,
  procurement_mode: PROCUREMENT_TAG,
  tagBatchId: String(batch.id),
  tag_batch_id: String(batch.id),
  tagPriceAtAdd: Number(batch.tagPrice ?? batch.tag_price ?? 0),
  tag_price_at_add: Number(batch.tagPrice ?? batch.tag_price ?? 0),
  tagClosesAt: batch.closesAt ?? batch.closes_at ?? null,
  tag_closes_at: batch.closesAt ?? batch.closes_at ?? null,
  expectedProcurementAt: batch.expectedProcurementAt ?? batch.expected_procurement_at ?? null,
  expected_procurement_at: batch.expectedProcurementAt ?? batch.expected_procurement_at ?? null,
} : {
  procurementMode: PROCUREMENT_STANDARD,
  procurement_mode: PROCUREMENT_STANDARD,
};
