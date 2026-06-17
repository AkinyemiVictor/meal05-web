"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveStockClass } from "@/lib/catalogue";
import { resolveProductImage } from "@/lib/product-image";
import { getAvailableCount } from "@/lib/stock";
import { useNotice } from "@/components/notice-provider";

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
    return stockClass === "is-unavailable" || stockClass === "is-limited" || availableCount === 0;
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

    if (Number.isFinite(availableCount) && parsedQuantity > availableCount) {
      showNotice({
        tone: "info",
        title: "Limited stock",
        message: `Only ${availableCount} item${availableCount === 1 ? "" : "s"} available.`,
        autoClose: true,
      });
      return;
    }

    const response = await fetch("/api/cart", {
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
    });
    if (!response.ok) {
      setFeedback({ tone: "error", message: "Sign in to add this item to your cart." });
      return;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("cart-updated"));
    }

    setFeedback({
      tone: "success",
      message: `${product.name} (${formatQuantityLabel(parsedQuantity)} item${parsedQuantity === 1 ? "" : "s"}) added to cart.`,
    });
  }, [availableCount, product, quantityInput, showNotice]);

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
          <span>Add to cart</span>
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
