"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatProductPrice, resolveStockClass } from "@/lib/catalogue";
import { resolveProductImage } from "@/lib/product-image";
import { getAvailableCount } from "@/lib/stock";
import { useNotice } from "@/components/notice-provider";
import { readStoredUser } from "@/lib/auth";
import { readCartItems, writeCartItems } from "@/lib/cart-storage";
import { addAuthenticatedCartItem } from "@/lib/cart-sync";
import {
  PROCUREMENT_STANDARD,
  PROCUREMENT_TAG,
  TAG_PURCHASE_ONLY,
  buildTagCartMetadata,
  formatTagDeadline,
  getCartProcurementConflict,
  getTagBatchForVariant,
  normalizeTagPurchaseMode,
} from "@/lib/tag-buy";
import {
  PURCHASE_MODE_LOOSE,
  clampQuantityToRules,
  formatQuantity,
  getVariantPurchaseRules,
  validateVariantQuantity,
} from "@/lib/purchase-quantities";

const RECENTLY_VIEWED_STORAGE_KEY = "meal05_recently_viewed";
const FIXED_QUANTITY_BLOCKED_KEYS = new Set([".", ",", "e", "E", "+", "-"]);

const formatUnitLabel = (unit) => {
  if (!unit) return "unit";
  return String(unit).replace(/^per\s+/i, "") || "unit";
};

const getLineKey = (item) =>
  String(item?.variantId || item?.id || item?.productId || "").trim();

const normaliseOrderCount = (value, product) => {
  const validation = validateVariantQuantity(product, value);
  if (validation.ok) return validation.quantity;
  return clampQuantityToRules(product, value);
};

const buildCartItem = (product, quantity, fallbackImage, procurementChoice = PROCUREMENT_STANDARD) => {
  const count = normaliseOrderCount(quantity, product);
  const variantId = product.variantId ?? product.id;
  const purchaseRules = getVariantPurchaseRules(product);
  const tagBatch = getTagBatchForVariant(product, product);
  const useTagBuy = procurementChoice === PROCUREMENT_TAG && Boolean(tagBatch?.id);
  return {
    id: variantId,
    productId: product.id,
    variantId,
    variantName: product.variantName || product.unit || "Default",
    name: product.name,
    category: product.category || "",
    categorySlug: product.categorySlug || "",
    packaging: product.packaging || "",
    unit: product.unit || "unit",
    price: useTagBuy ? Number(tagBatch.tagPrice || 0) : Number(product.price || 0),
    purchaseMode: purchaseRules.purchaseMode,
    purchase_mode: purchaseRules.purchaseMode,
    minQuantity: purchaseRules.minQuantity,
    min_quantity: purchaseRules.minQuantity,
    maxQuantity: purchaseRules.maxQuantity,
    max_quantity: purchaseRules.maxQuantity,
    stepQuantity: purchaseRules.stepQuantity,
    step_quantity: purchaseRules.stepQuantity,
    baseUnit: purchaseRules.baseUnit || null,
    base_unit: purchaseRules.baseUnit || null,
    baseQuantity: purchaseRules.baseQuantity ?? null,
    base_quantity: purchaseRules.baseQuantity ?? null,
    weightMin: product.weightMin ?? product.weight_min ?? null,
    weight_min: product.weight_min ?? product.weightMin ?? null,
    weightMax: product.weightMax ?? product.weight_max ?? null,
    weight_max: product.weight_max ?? product.weightMax ?? null,
    weightUnit: product.weightUnit ?? product.weight_unit ?? null,
    weight_unit: product.weight_unit ?? product.weightUnit ?? null,
    volumeMin: product.volumeMin ?? product.volume_min ?? null,
    volume_min: product.volume_min ?? product.volumeMin ?? null,
    volumeMax: product.volumeMax ?? product.volume_max ?? null,
    volume_max: product.volume_max ?? product.volumeMax ?? null,
    volumeUnit: product.volumeUnit ?? product.volume_unit ?? null,
    volume_unit: product.volume_unit ?? product.volumeUnit ?? null,
    optionRole: product.optionRole ?? product.option_role ?? null,
    option_role: product.option_role ?? product.optionRole ?? null,
    availabilityMode: product.availabilityMode ?? product.availability_mode ?? "standard",
    availability_mode: product.availability_mode ?? product.availabilityMode ?? "standard",
    inventoryTrackingMode: product.inventoryTrackingMode ?? product.inventory_tracking_mode ?? "tracked",
    inventory_tracking_mode: product.inventory_tracking_mode ?? product.inventoryTrackingMode ?? "tracked",
    selectionModel: product.selectionModel ?? product.selection_model ?? "exact_variant",
    selection_model: product.selection_model ?? product.selectionModel ?? "exact_variant",
    variationNote: product.variationNote ?? product.variation_note ?? "",
    sizePreference: product.sizePreference ?? product.size_preference ?? null,
    size_preference: product.size_preference ?? product.sizePreference ?? null,
    orderSize: 1,
    orderCount: count,
    quantity: count,
    stock: product.stock,
    image: resolveProductImage(product.image, product.mainImageUrl || fallbackImage),
    ...buildTagCartMetadata(useTagBuy ? tagBatch : null),
    tagBatch: useTagBuy ? tagBatch : null,
  };
};

const updateRecentlyViewed = (id) => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const entries = Array.isArray(parsed) ? parsed : [];
    const idString = String(id);
    const next = [idString, ...entries.filter((entry) => String(entry) !== idString)].slice(0, 20);
    window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("Could not update recently viewed list", error);
  }
};

export default function AddToCartForm({ product, fallbackImage }) {
  const purchaseRules = useMemo(() => getVariantPurchaseRules(product), [product]);
  const isLoose = purchaseRules.purchaseMode === PURCHASE_MODE_LOOSE;
  const [quantityInput, setQuantityInput] = useState(() => String(purchaseRules.minQuantity));
  const [procurementChoice, setProcurementChoice] = useState(PROCUREMENT_STANDARD);
  const [feedback, setFeedback] = useState({ tone: "idle", message: "" });
  const unitLabel = useMemo(() => formatUnitLabel(product.unit), [product.unit]);
  const { showNotice } = useNotice();
  const activeTagBatch = getTagBatchForVariant(product, product);
  const activeTagBatchId = activeTagBatch?.id || "";
  const tagPurchaseMode = normalizeTagPurchaseMode(activeTagBatch?.purchaseMode ?? activeTagBatch?.purchase_mode);
  const isTagSelection = procurementChoice === PROCUREMENT_TAG && Boolean(activeTagBatch?.id);

  const availableCount = useMemo(() => getAvailableCount(product?.stock), [product?.stock]);
  const availabilityMode = String(product?.availabilityMode ?? product?.availability_mode ?? "standard");
  const bypassLocalStock = isTagSelection || availabilityMode === "request" || String(product?.inventoryTrackingMode ?? product?.inventory_tracking_mode) === "supplier";
  const effectiveMaxQuantity = useMemo(() => {
    if (isTagSelection) {
      return Math.min(purchaseRules.maxQuantity ?? activeTagBatch.remainingQuantity, activeTagBatch.remainingQuantity);
    }
    if (!bypassLocalStock && Number.isFinite(availableCount)) {
      return Math.min(purchaseRules.maxQuantity ?? availableCount, availableCount);
    }
    return purchaseRules.maxQuantity;
  }, [activeTagBatch?.remainingQuantity, availableCount, bypassLocalStock, isTagSelection, purchaseRules.maxQuantity]);
  const quantityValidation = useMemo(
    () => validateVariantQuantity(product, quantityInput),
    [product, quantityInput]
  );
  const safeQuantity = quantityValidation.ok ? quantityValidation.quantity : purchaseRules.minQuantity;

  const isUnavailable = useMemo(() => {
    if (availabilityMode === "unavailable" && !isTagSelection) return true;
    if (bypassLocalStock) return false;
    const stockClass = resolveStockClass(product?.stock);
    return stockClass === "is-unavailable" || availableCount === 0;
  }, [product?.stock, availableCount, availabilityMode, bypassLocalStock, isTagSelection]);

  useEffect(() => {
    updateRecentlyViewed(product.id);
  }, [product.id]);

  useEffect(() => {
    setQuantityInput(String(purchaseRules.minQuantity));
    setFeedback({ tone: "idle", message: "" });
  }, [product.variantId, purchaseRules.minQuantity]);

  useEffect(() => {
    setProcurementChoice(activeTagBatchId && tagPurchaseMode === TAG_PURCHASE_ONLY ? PROCUREMENT_TAG : PROCUREMENT_STANDARD);
    setFeedback({ tone: "idle", message: "" });
  }, [activeTagBatchId, tagPurchaseMode]);

  const resetFeedback = () => setFeedback({ tone: "idle", message: "" });

  const setNextQuantity = (nextValue) => {
    const nextCount = clampQuantityToRules(product, nextValue);
    setQuantityInput(String(nextCount));
    resetFeedback();
  };

  const handleChange = (event) => {
    const nextValue = isLoose ? event.target.value : event.target.value.replace(/\D/g, "");
    setQuantityInput(nextValue);
    resetFeedback();
  };

  const handleKeyDown = (event) => {
    if (!isLoose && FIXED_QUANTITY_BLOCKED_KEYS.has(event.key)) {
      event.preventDefault();
    }
  };

  const handleDecrement = () => {
    setNextQuantity(safeQuantity - purchaseRules.stepQuantity);
  };

  const handleIncrement = () => {
    const next = safeQuantity + purchaseRules.stepQuantity;
    if (effectiveMaxQuantity != null) {
      setNextQuantity(Math.min(next, effectiveMaxQuantity || purchaseRules.minQuantity));
      return;
    }
    setNextQuantity(next);
  };

  const handleAddToCart = useCallback(async () => {
    const variantId = product.variantId ?? product.id;
    if (!variantId) {
      setFeedback({ tone: "error", message: "Please select an option before adding to cart." });
      return;
    }

    const validation = validateVariantQuantity(product, quantityInput);

    if (!validation.ok) {
      setFeedback({ tone: "error", message: validation.error });
      return;
    }

    const parsedQuantity = validation.quantity;

    if (isTagSelection && parsedQuantity > Number(activeTagBatch.remainingQuantity || 0)) {
      setFeedback({ tone: "error", message: `Only ${Number(activeTagBatch.remainingQuantity || 0)} remains in this Tag Buy.` });
      return;
    }

    if (isUnavailable) {
      setFeedback({ tone: "error", message: "This item is out of stock." });
      return;
    }

    if (!bypassLocalStock && Number.isFinite(availableCount) && parsedQuantity > availableCount) {
      showNotice({
        tone: "info",
        title: "Limited stock",
        message: `Only ${formatQuantity(availableCount)} ${unitLabel} available.`,
        autoClose: true,
      });
      return;
    }

    const items = readCartItems();
    const incomingItem = buildCartItem(product, parsedQuantity, fallbackImage, procurementChoice);
    const procurementConflict = getCartProcurementConflict(items, incomingItem);
    if (procurementConflict) {
      setFeedback({ tone: "error", message: procurementConflict });
      showNotice({ tone: "info", title: "Separate checkout required", message: procurementConflict });
      return;
    }
    const lineKey = getLineKey({ variantId, id: product.id, productId: product.id });
    const productIdKey = String(product.id || "");
    const index = items.findIndex((item) => {
      const itemKey = getLineKey(item);
      const itemProductKey = String(item?.productId || item?.id || "");
      return (
        itemKey === lineKey ||
        (!product.variantId && itemKey === productIdKey) ||
        (!product.variantId && itemProductKey === productIdKey)
      );
    });

    if (index >= 0) {
      const existing = items[index];
      const nextCount = normaliseOrderCount(existing.orderCount ?? existing.quantity ?? 0, product) + parsedQuantity;
      if (isTagSelection && nextCount > Number(activeTagBatch.remainingQuantity || 0)) {
        setFeedback({ tone: "error", message: `Only ${Number(activeTagBatch.remainingQuantity || 0)} remains in this Tag Buy.` });
        return;
      }
      const nextValidation = validateVariantQuantity(product, nextCount);
      if (!nextValidation.ok) {
        setFeedback({ tone: "error", message: nextValidation.error });
        return;
      }
      if (!bypassLocalStock && Number.isFinite(availableCount) && nextCount > availableCount) {
        showNotice({
          tone: "info",
          title: "Limited stock",
          message: `Only ${formatQuantity(availableCount)} ${unitLabel} available.`,
          autoClose: true,
        });
        return;
      }
      items[index] = {
        ...existing,
        ...buildCartItem(product, nextCount, fallbackImage, procurementChoice),
      };
    } else {
      items.push(buildCartItem(product, parsedQuantity, fallbackImage, procurementChoice));
    }
    try {
      if (readStoredUser()) {
        await addAuthenticatedCartItem(buildCartItem(product, parsedQuantity, fallbackImage, procurementChoice), {
          source: "product-detail",
        });
      } else {
        writeCartItems(items, undefined, { source: "product-detail" });
      }
    } catch (error) {
      const message = error?.message || "Unable to add this item to your cart.";
      setFeedback({ tone: "error", message });
      showNotice({ tone: "error", title: "Cart not updated", message });
      return;
    }

    setFeedback({ tone: "idle", message: "" });
  }, [activeTagBatch, availableCount, bypassLocalStock, fallbackImage, isTagSelection, isUnavailable, procurementChoice, product, quantityInput, showNotice, unitLabel]);

  const handleBlur = () => {
    const validation = validateVariantQuantity(product, quantityInput);
    setQuantityInput(String(validation.ok ? validation.quantity : clampQuantityToRules(product, quantityInput)));
  };

  return (
    <div className="product-detail-actions">
      {activeTagBatch ? (
        <fieldset className="mb-5 border-0 p-0">
          <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-meal-muted">
            How would you like to buy?
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {tagPurchaseMode !== TAG_PURCHASE_ONLY ? (
              <button
                type="button"
                onClick={() => setProcurementChoice(PROCUREMENT_STANDARD)}
                aria-pressed={!isTagSelection}
                className={`rounded-2xl border p-3 text-left transition ${!isTagSelection ? "border-meal-ink bg-meal-ink text-meal-paper" : "border-meal-line bg-meal-paper text-meal-text"}`}
              >
                <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em]"><span>Buy now</span><span aria-hidden="true">{!isTagSelection ? "●" : "○"}</span></span>
                <strong className="mt-2 block text-lg">{formatProductPrice(product.price, "")}</strong>
                <span className={`mt-1 block text-xs ${!isTagSelection ? "text-meal-paper/75" : "text-meal-muted"}`}>Regular purchase · faster fulfilment</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setProcurementChoice(PROCUREMENT_TAG)}
              aria-pressed={isTagSelection}
              className={`rounded-2xl border p-3 text-left transition ${isTagSelection ? "border-amber-700 bg-amber-100" : "border-amber-200 bg-amber-50"}`}
            >
              <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-amber-950">
                <span>Tag Buy</span><span>Save {formatProductPrice(Math.max(0, Number(product.price || 0) - Number(activeTagBatch.tagPrice || 0)), "")}</span>
              </span>
              <strong className="mt-2 block text-lg text-amber-950">{formatProductPrice(activeTagBatch.tagPrice, "")}</strong>
              <span className="mt-1 block text-xs text-amber-900">{Number(activeTagBatch.committedQuantity || 0)} / {Number(activeTagBatch.targetQuantity || 0)} committed · closes {formatTagDeadline(activeTagBatch.closesAt)}</span>
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-meal-muted">Tag Buy fulfils after the group closes. If the minimum is missed, the {activeTagBatch.failurePolicy === "carry_forward" ? "carry-forward" : "refund"} policy applies.</p>
        </fieldset>
      ) : null}
      <label htmlFor="product-quantity" className="product-detail-actions__label">
        Quantity
      </label>
      <div className="product-detail-actions__controls">
        <div className="product-detail-actions__quantity" role="group" aria-label={`Quantity in ${unitLabel}`}>
          <button
            type="button"
            className="product-detail-actions__stepper"
            onClick={handleDecrement}
            disabled={safeQuantity <= purchaseRules.minQuantity}
            aria-label="Decrease quantity"
          >
            -
          </button>
          <input
            id="product-quantity"
            type={isLoose ? "number" : "text"}
            min={purchaseRules.minQuantity}
            max={purchaseRules.maxQuantity ?? undefined}
            step={purchaseRules.stepQuantity}
            inputMode={isLoose ? "decimal" : "numeric"}
            pattern={isLoose ? undefined : "[0-9]*"}
            value={quantityInput}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
          <button
            type="button"
            className="product-detail-actions__stepper"
            onClick={handleIncrement}
            disabled={effectiveMaxQuantity != null && safeQuantity >= effectiveMaxQuantity}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={handleAddToCart}
          className="product-detail-actions__submit"
          disabled={isUnavailable}
          aria-disabled={isUnavailable}
        >
          <i className="fa-solid fa-cart-shopping" aria-hidden="true" />
          <span>{isUnavailable ? "Unavailable" : isTagSelection ? `Join Tag Buy — ${formatProductPrice(Number(activeTagBatch.tagPrice || 0) * safeQuantity, "")}` : availabilityMode === "request" ? "Add to availability basket" : `Add to cart — ${formatProductPrice(Number(product.price || 0) * safeQuantity, "")}`}</span>
        </button>
      </div>
      {feedback.message ? (
        <p
          className={`product-detail-actions__feedback product-detail-actions__feedback--${feedback.tone}`.trim()}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
