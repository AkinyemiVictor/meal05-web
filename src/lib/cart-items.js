import {
  clampQuantityToRules,
  roundQuantity,
  validateVariantQuantity,
} from "./product-quantity.js";

const positiveQuantity = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(0.001, roundQuantity(numeric));
};

export const getCartItemQuantity = (item, fallback = 1) => {
  const explicit = positiveQuantity(item?.quantity, 0);
  if (explicit > 0) return explicit;

  const legacySize = positiveQuantity(item?.orderSize, 1);
  const legacyCount = positiveQuantity(item?.orderCount, fallback);
  return roundQuantity(legacySize * legacyCount);
};

const normalizeQuantityForItem = (item) => {
  const quantity = getCartItemQuantity(item);
  const validation = validateVariantQuantity(item, quantity);
  return validation.ok ? validation.quantity : clampQuantityToRules(item, quantity);
};

const firstText = (...values) => {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.trim());
  return value ? value.trim() : "";
};

export const getLiveCartProductImageUrl = (productId, size = "thumb") => {
  const id = String(productId ?? "").trim();
  if (!id) return "";
  const normalizedSize = ["thumb", "card", "detail"].includes(String(size)) ? String(size) : "thumb";
  return `/api/products/${encodeURIComponent(id)}/image?size=${normalizedSize}`;
};

export const normalizeCartItem = (item) => {
  if (!item || typeof item !== "object") return null;

  const draft = { ...item };
  const variantId = draft.variantId ?? draft.variant_id ?? null;
  const rawProductId =
    draft.productId ??
    draft.product_id ??
    draft.product?.id ??
    (variantId == null ? draft.id : null);
  const productId =
    variantId != null && String(rawProductId ?? "") === String(variantId)
      ? null
      : rawProductId;
  const cartItemId =
    draft.cartItemId ??
    draft.cart_item_id ??
    (draft.variant_id != null ? draft.id : null);
  const lineId = variantId ?? draft.id ?? productId;
  const quantity = normalizeQuantityForItem(draft);
  const productName = firstText(
    draft.productName,
    draft.product_name,
    draft.products?.name,
    draft.name
  );
  const variantName = firstText(draft.variantName, draft.variant_name);
  const price = Number(draft.price ?? draft.unitPrice ?? draft.unit_price_at_add ?? 0);
  const normalizedPrice = Number.isFinite(price) && price >= 0 ? price : 0;
  const liveImage = getLiveCartProductImageUrl(productId, "thumb");

  return {
    ...draft,
    id: lineId,
    cartItemId,
    productId,
    variantId,
    productName,
    name: productName || variantName || "Product",
    variantName,
    price: normalizedPrice,
    unitPrice: normalizedPrice,
    lineTotal: normalizedPrice * quantity,
    // Cart/checkout must not keep a historical image snapshot. Whenever we know the
    // product id, point at the live image resolver so image replacements propagate to
    // existing guest carts, signed-in carts and checkout summaries automatically.
    image: firstText(
      liveImage,
      draft.variantImageUrl,
      draft.variant_image_url,
      draft.products?.image_url,
      draft.image,
      draft.imageUrl,
      draft.image_url
    ),
    unit: firstText(draft.unit, draft.base_unit),
    minQuantity: draft.minQuantity ?? draft.min_quantity,
    maxQuantity: draft.maxQuantity ?? draft.max_quantity,
    stepQuantity: draft.stepQuantity ?? draft.step_quantity,
    availabilityMode: firstText(draft.availabilityMode, draft.availability_mode) || "standard",
    inventoryTrackingMode: firstText(draft.inventoryTrackingMode, draft.inventory_tracking_mode) || "tracked",
    selectionModel: firstText(draft.selectionModel, draft.selection_model) || "exact_variant",
    variationNote: firstText(draft.variationNote, draft.variation_note),
    sizePreference: firstText(draft.sizePreference, draft.size_preference) || null,
    orderSize: 1,
    orderCount: quantity,
    quantity,
  };
};

export const normalizeCartItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeCartItem).filter(Boolean);
};
