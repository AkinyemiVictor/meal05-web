"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveStockClass } from "@/lib/catalogue";
import { resolveProductImage } from "@/lib/product-image";
import { getAvailableCount } from "@/lib/stock";
import { useNotice } from "@/components/notice-provider";
import { readStoredUser } from "@/lib/auth";
import { readCartItems, writeCartItems } from "@/lib/cart-storage";
import {
  PURCHASE_MODE_LOOSE,
  clampQuantityToRules,
  formatQuantity,
  getVariantPurchaseRules,
  validateVariantQuantity,
} from "@/lib/purchase-quantities";

const RECENTLY_VIEWED_STORAGE_KEY = "meal05_recently_viewed";

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

const buildCartItem = (product, quantity, fallbackImage) => {
  const count = normaliseOrderCount(quantity, product);
  const variantId = product.variantId ?? product.id;
  const purchaseRules = getVariantPurchaseRules(product);
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
    price: Number(product.price || 0),
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
    orderSize: 1,
    orderCount: count,
    quantity: count,
    stock: product.stock,
    image: resolveProductImage(product.image, product.mainImageUrl || fallbackImage),
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
  const [feedback, setFeedback] = useState({ tone: "idle", message: "" });
  const unitLabel = useMemo(() => formatUnitLabel(product.unit), [product.unit]);
  const { showNotice } = useNotice();

  const availableCount = useMemo(() => getAvailableCount(product?.stock), [product?.stock]);
  const quantityValidation = useMemo(
    () => validateVariantQuantity(product, quantityInput),
    [product, quantityInput]
  );
  const safeQuantity = quantityValidation.ok ? quantityValidation.quantity : purchaseRules.minQuantity;

  const isUnavailable = useMemo(() => {
    const stockClass = resolveStockClass(product?.stock);
    return stockClass === "is-unavailable" || availableCount === 0;
  }, [product?.stock, availableCount]);

  useEffect(() => {
    updateRecentlyViewed(product.id);
  }, [product.id]);

  useEffect(() => {
    setQuantityInput(String(purchaseRules.minQuantity));
    setFeedback({ tone: "idle", message: "" });
  }, [product.variantId, purchaseRules.minQuantity]);

  const resetFeedback = () => setFeedback({ tone: "idle", message: "" });

  const setNextQuantity = (nextValue) => {
    const nextCount = clampQuantityToRules(product, nextValue);
    setQuantityInput(String(nextCount));
    resetFeedback();
  };

  const handleChange = (event) => {
    setQuantityInput(event.target.value);
    resetFeedback();
  };

  const handleDecrement = () => {
    setNextQuantity(safeQuantity - purchaseRules.stepQuantity);
  };

  const handleIncrement = () => {
    const next = safeQuantity + purchaseRules.stepQuantity;
    if (Number.isFinite(availableCount)) {
      setNextQuantity(Math.min(next, availableCount || purchaseRules.minQuantity));
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

    if (isUnavailable) {
      setFeedback({ tone: "error", message: "This item is out of stock." });
      return;
    }

    if (Number.isFinite(availableCount) && parsedQuantity > availableCount) {
      showNotice({
        tone: "info",
        title: "Limited stock",
        message: `Only ${formatQuantity(availableCount)} ${unitLabel} available.`,
        autoClose: true,
      });
      return;
    }

    const items = readCartItems();
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
      const nextValidation = validateVariantQuantity(product, nextCount);
      if (!nextValidation.ok) {
        setFeedback({ tone: "error", message: nextValidation.error });
        return;
      }
      if (Number.isFinite(availableCount) && nextCount > availableCount) {
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
        ...buildCartItem(product, nextCount, fallbackImage),
      };
    } else {
      items.push(buildCartItem(product, parsedQuantity, fallbackImage));
    }
    writeCartItems(items, undefined, { source: "product-detail" });

    if (readStoredUser()) {
      fetch("/api/cart", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          variant_id: variantId,
          variant_name: product.variantName,
          product_name: product.name,
          unit_price_at_add: product.price,
          quantity: parsedQuantity,
        }),
      }).catch(() => {});
    }

    setFeedback({
      tone: "success",
      message: "Added to cart.",
    });
  }, [availableCount, fallbackImage, isUnavailable, product, quantityInput, showNotice, unitLabel]);

  const handleBlur = () => {
    const validation = validateVariantQuantity(product, quantityInput);
    setQuantityInput(String(validation.ok ? validation.quantity : clampQuantityToRules(product, quantityInput)));
  };

  return (
    <div className="product-detail-actions">
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
            type="number"
            min={purchaseRules.minQuantity}
            max={purchaseRules.maxQuantity ?? undefined}
            step={purchaseRules.stepQuantity}
            inputMode={isLoose ? "decimal" : "numeric"}
            value={quantityInput}
            onChange={handleChange}
            onBlur={handleBlur}
          />
          <button
            type="button"
            className="product-detail-actions__stepper"
            onClick={handleIncrement}
            disabled={Number.isFinite(availableCount) && safeQuantity >= availableCount}
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
          <span>{isUnavailable ? "Out of stock" : "Add to cart"}</span>
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
