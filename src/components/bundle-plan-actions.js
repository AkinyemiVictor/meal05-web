"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

import { useNotice } from "@/components/notice-provider";
import { addBundlePlanToCart, buildBundleCartNotice } from "@/lib/bundle-cart";

const MIN_QUANTITY = 1;

const parseWholeQuantity = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < MIN_QUANTITY || !Number.isInteger(numeric)) {
    return NaN;
  }
  return numeric;
};

const normaliseQuantityInput = (value) => {
  const parsed = parseWholeQuantity(value);
  return Number.isFinite(parsed) ? String(parsed) : String(MIN_QUANTITY);
};

export default function BundlePlanActions({ plan, backHref = "/section/bundle-plans" }) {
  const [quantityInput, setQuantityInput] = useState("1");
  const [isAdding, setIsAdding] = useState(false);
  const { showNotice } = useNotice();

  const handleAddToCart = useCallback(async () => {
    if (isAdding || !plan) return;
    const quantityPerItem = parseWholeQuantity(quantityInput);

    if (!Number.isFinite(quantityPerItem)) {
      showNotice({
        tone: "error",
        title: "Invalid quantity",
        message: "Enter a valid whole number (1 or more).",
      });
      return;
    }

    setIsAdding(true);
    try {
      const result = await addBundlePlanToCart(plan, { quantityPerItem });
      showNotice(buildBundleCartNotice(plan?.name, result));
    } catch {
      showNotice({
        tone: "error",
        title: "Unable to add pack",
        message: "Please try again in a moment.",
      });
    } finally {
      setIsAdding(false);
    }
  }, [isAdding, plan, quantityInput, showNotice]);

  return (
    <div className="bundle-plan-page__actions">
      <div className="product-detail-actions">
        <label htmlFor="bundle-plan-quantity" className="product-detail-actions__label">
          Quantity (pack)
        </label>
        <div className="product-detail-actions__controls">
          <input
            id="bundle-plan-quantity"
            type="number"
            min={MIN_QUANTITY}
            step="1"
            inputMode="numeric"
            value={quantityInput}
            onChange={(event) => setQuantityInput(event.target.value)}
            onBlur={() => setQuantityInput((current) => normaliseQuantityInput(current))}
            aria-describedby="bundle-plan-quantity-helper"
          />
          <button
            type="button"
            className="bundle-plan-page__add product-detail-actions__submit"
            onClick={handleAddToCart}
            disabled={isAdding}
            aria-label={`Add ${plan?.name || "pack"} to cart`}
          >
            <span className="product-card__cta-icon" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="8" cy="19" r="1.5" fill="currentColor" />
                <circle cx="17" cy="19" r="1.5" fill="currentColor" />
                <path
                  d="M3 5H5L6.2 13.1C6.33347 13.983 7.07703 14.6425 7.96984 14.6425H17.4C18.1232 14.6425 18.753 14.1615 18.9363 13.4605L21 6.14246H6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            {isAdding ? "Adding..." : "Add to cart"}
          </button>
        </div>
        <p id="bundle-plan-quantity-helper" className="product-detail-actions__helper">
          Use whole numbers only (1, 2, 3...).
        </p>
      </div>
      <Link href={backHref} className="bundle-plan-page__back">
        Back to Bundle Plans
      </Link>
    </div>
  );
}
