"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { useNotice } from "@/components/notice-provider";
import { addBundlePlanToCart, buildBundleCartNotice } from "@/lib/bundle-cart";
import { getBundlePlanPricingState } from "@/lib/bundle-plans";

export default function BundlePlanCard({ plan, className = "", asListItem = true }) {
  const [isAdding, setIsAdding] = useState(false);
  const { showNotice } = useNotice();

  const handleAddToCart = useCallback(async () => {
    if (isAdding || !plan) return;
    setIsAdding(true);
    try {
      const result = await addBundlePlanToCart(plan);
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
  }, [isAdding, plan, showNotice]);

  if (!plan) return null;

  const cardClasses = ["product-card", "product-card--with-cta", "bundle-plan-card", className]
    .filter(Boolean)
    .join(" ");
  const href = `/bundle-plans/${plan.slug}`;
  const pricing = getBundlePlanPricingState(plan);
  const bundlePriceLabel = pricing.bundlePriceLabel
    ? `${pricing.bundlePriceLabel}/pack`
    : "/pack";
  const oldPriceLabel = pricing.individualTotalLabel
    ? `${pricing.individualTotalLabel}/pack`
    : "--/pack";
  const [priceValue, unitValue] = bundlePriceLabel.split("/");

  const content = (
    <>
      <Link href={href} className="product-card__link" aria-label={`View ${plan.name}`}>
        <div>
          <div className="product-card__imageWrap">
            <Image
              src={plan.image}
              alt={plan.name}
              className="productImg"
              width={140}
              height={140}
              sizes="(max-width: 768px) 120px, 140px"
              loading="lazy"
            />
          </div>
          <div className="product-card-details">
            <h4>{plan.name}</h4>
            <span className="product-card__price">
              <span className="price">{priceValue}</span>
              {unitValue ? <span className="price-unit">/{unitValue}</span> : null}
            </span>
            <span className="old-price">{oldPriceLabel}</span>
          </div>
        </div>
      </Link>
      <div className="product-card__cta">
        <button
          type="button"
          className="product-card__cta-button"
          onClick={handleAddToCart}
          disabled={isAdding}
          aria-label={`Add ${plan.name} to cart`}
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
          <span className="product-card__cta-label">
            {isAdding ? "Adding..." : "Add to order"}
          </span>
        </button>
      </div>
    </>
  );

  if (!asListItem) {
    return <article className={cardClasses}>{content}</article>;
  }

  return (
    <article className={cardClasses} role="listitem">
      {content}
    </article>
  );
}
