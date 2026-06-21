"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveStockClass } from "@/lib/catalogue";
import { resolveProductImage } from "@/lib/product-image";
import { getAvailableCount } from "@/lib/stock";
import { useNotice } from "@/components/notice-provider";
import { readStoredUser } from "@/lib/auth";
import { readCartItems, writeCartItems } from "@/lib/cart-storage";

const RECENTLY_VIEWED_STORAGE_KEY = "meal05_recently_viewed";
const MIN_QUANTITY = 1;

const formatUnitLabel = (unit) => {
  if (!unit) return "unit";
  return unit;
};

const parseWholeQuantity = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MIN_QUANTITY || !Number.isInteger(parsed)) {
    return NaN;
  }
  return parsed;
};

const normaliseOrderCount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 1;
  }
  return Math.max(1, Math.round(numeric));
};

const getLineKey = (item) =>
  String(item?.variantId || item?.id || item?.productId || "").trim();

const buildCartItem = (product, quantity, fallbackImage) => {
  const count = normaliseOrderCount(quantity);
  const variantId = product.variantId ?? product.id;
  return {
    id: variantId,
    productId: product.id,
    variantId,
    variantName: product.variantName || product.unit || "Default",
    name: product.name,
    unit: product.unit || "unit",
    price: Number(product.price || 0),
    orderSize: 1,
    orderCount: count,
    quantity: count,
    stock: product.stock,
    note: "Added from product details",
    image: resolveProductImage(product.image, product.mainImageUrl || fallbackImage),
  };
};

const formatQuantityLabel = (value) => {
  const numeric = parseWholeQuantity(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString();
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
  const [quantityInput, setQuantityInput] = useState("1");
  const [feedback, setFeedback] = useState({ tone: "idle", message: "" });
  const unitLabel = useMemo(() => formatUnitLabel(product.unit), [product.unit]);
  const { showNotice } = useNotice();

  const availableCount = useMemo(() => getAvailableCount(product?.stock), [product?.stock]);

  const isUnavailable = useMemo(() => {
    const stockClass = resolveStockClass(product?.stock);
    return stockClass === "is-unavailable" || availableCount === 0;
  }, [product?.stock, availableCount]);

  useEffect(() => {
    updateRecentlyViewed(product.id);
  }, [product.id]);

  const resetFeedback = () => setFeedback({ tone: "idle", message: "" });
  const parsedQuantity = parseWholeQuantity(quantityInput);
  const safeQuantity = Number.isFinite(parsedQuantity) ? parsedQuantity : MIN_QUANTITY;

  const setNextQuantity = (nextValue) => {
    const nextCount = Math.max(MIN_QUANTITY, Math.round(Number(nextValue) || MIN_QUANTITY));
    setQuantityInput(String(nextCount));
    resetFeedback();
  };

  const handleChange = (event) => {
    setQuantityInput(event.target.value);
    resetFeedback();
  };

  const handleDecrement = () => {
    setNextQuantity(safeQuantity - 1);
  };

  const handleIncrement = () => {
    if (Number.isFinite(availableCount)) {
      setNextQuantity(Math.min(safeQuantity + 1, availableCount || MIN_QUANTITY));
      return;
    }
    setNextQuantity(safeQuantity + 1);
  };

  const handleAddToCart = useCallback(async () => {
    const variantId = product.variantId ?? product.id;
    if (!variantId) {
      setFeedback({ tone: "error", message: "Please select an option before adding to cart." });
      return;
    }

    const parsedQuantity = parseWholeQuantity(quantityInput);

    if (!Number.isFinite(parsedQuantity)) {
      setFeedback({ tone: "error", message: "Enter a valid whole number (1 or more)." });
      return;
    }

    if (isUnavailable) {
      setFeedback({ tone: "error", message: "This item is out of stock." });
      return;
    }

    if (Number.isFinite(availableCount) && parsedQuantity > availableCount) {
      showNotice({
        tone: "info",
        title: "Limited stock",
        message: `Only ${availableCount} item${availableCount === 1 ? "" : "s"} available.`,
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
      const nextCount = normaliseOrderCount(existing.orderCount ?? existing.quantity ?? 0) + parsedQuantity;
      if (Number.isFinite(availableCount) && nextCount > availableCount) {
        showNotice({
          tone: "info",
          title: "Limited stock",
          message: `Only ${availableCount} item${availableCount === 1 ? "" : "s"} available.`,
          autoClose: true,
        });
        return;
      }
      items[index] = {
        ...existing,
        ...buildCartItem(product, nextCount, fallbackImage),
        note: existing.note || "Added from product details",
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
      message: `${product.name} (${formatQuantityLabel(parsedQuantity)} item${parsedQuantity === 1 ? "" : "s"}) added to cart.`,
    });
  }, [availableCount, fallbackImage, isUnavailable, product, quantityInput, showNotice]);

  const handleBlur = () => {
    const parsed = parseWholeQuantity(quantityInput);
    setQuantityInput(Number.isFinite(parsed) ? String(parsed) : String(MIN_QUANTITY));
  };

  return (
    <div className="product-detail-actions">
      <label htmlFor="product-quantity" className="product-detail-actions__label sr-only">
        Quantity ({unitLabel})
      </label>
      <div className="product-detail-actions__controls">
        <div className="product-detail-actions__quantity" role="group" aria-label={`Quantity in ${unitLabel}`}>
          <button
            type="button"
            className="product-detail-actions__stepper"
            onClick={handleDecrement}
            disabled={safeQuantity <= MIN_QUANTITY}
            aria-label="Decrease quantity"
          >
            -
          </button>
          <input
            id="product-quantity"
            type="number"
            min={MIN_QUANTITY}
            step="1"
            inputMode="numeric"
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
