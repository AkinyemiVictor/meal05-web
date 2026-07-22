"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import copy from "@/data/copy";
import { formatProductPrice } from "@/lib/catalogue";
import {
  CHECKOUT_PROMO_UPDATED_EVENT,
  applyStoredPromoToSummary,
  computeCartSummary,
  readStoredCart,
  readStoredPromo,
} from "@/lib/checkout";
import { getDeliverySummaryConfig, resolveDeliveryArea } from "@/lib/delivery-settings";
import { resolveProductImage } from "@/lib/product-image";
import { useProductsByIds } from "@/lib/use-catalog-products";
import { formatQuantity } from "@/lib/purchase-quantities";

export default function CheckoutSummary({
  deliverySettings,
  deliveryCity,
  selectedDispatchOptionId = "",
  dispatchOptions = [],
  fulfillmentType = "delivery",
  submitFormId,
}) {
  const [items, setItems] = useState(() => readStoredCart());
  const [promoState, setPromoState] = useState(() => readStoredPromo());
  const [lastCheckout, setLastCheckout] = useState(null);
  const lookupIds = useMemo(
    () => items.map((item) => String(item?.productId ?? item?.id ?? "").trim()).filter(Boolean),
    [items]
  );
  const { index: productIndex } = useProductsByIds(lookupIds);

  const deliveryArea = useMemo(
    () => resolveDeliveryArea(deliverySettings, deliveryCity),
    [deliverySettings, deliveryCity]
  );
  const summaryConfig = useMemo(
    () => {
      const config = getDeliverySummaryConfig(deliverySettings, deliveryCity);
      if (String(deliveryCity || "").trim() && !deliveryArea.available) {
        return { ...config, deliveryFee: 0 };
      }
      if (fulfillmentType === "pickup") return { ...config, deliveryFee: 0 };
      const dispatchOption = dispatchOptions.find(option => String(option.id) === String(selectedDispatchOptionId));
      return { ...config, deliveryFee: Number(dispatchOption?.fee || 0) };
    },
    [deliveryArea, deliverySettings, deliveryCity, selectedDispatchOptionId, dispatchOptions, fulfillmentType]
  );
  const selectedDispatchOption = useMemo(
    () => dispatchOptions.find(option => String(option.id) === String(selectedDispatchOptionId)) || null,
    [dispatchOptions, selectedDispatchOptionId]
  );
  const deliveryUnavailable = Boolean(String(deliveryCity || "").trim()) && !deliveryArea.available;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleCartUpdated = () => {
      const updated = readStoredCart();
      setItems(updated);
      if (updated.length) {
        setLastCheckout(null);
      }
    };
    const handlePromoUpdated = (event) => {
      setPromoState(event?.detail?.promo ?? readStoredPromo());
      setLastCheckout(null);
    };

    const handleCheckoutCompleted = (event) => {
      const detail = event?.detail || {};
      const completedItems = Array.isArray(detail.items) ? detail.items : [];
      const summary = detail.summary ?? computeCartSummary(completedItems, summaryConfig);
      setLastCheckout({
        items: completedItems,
        summary,
      });
    };

    window.addEventListener("storage", handleCartUpdated);
    window.addEventListener("cart-updated", handleCartUpdated);
    window.addEventListener(CHECKOUT_PROMO_UPDATED_EVENT, handlePromoUpdated);
    window.addEventListener("checkout-completed", handleCheckoutCompleted);

    return () => {
      window.removeEventListener("storage", handleCartUpdated);
      window.removeEventListener("cart-updated", handleCartUpdated);
      window.removeEventListener(CHECKOUT_PROMO_UPDATED_EVENT, handlePromoUpdated);
      window.removeEventListener("checkout-completed", handleCheckoutCompleted);
    };
  }, [summaryConfig]);

  const itemsToRender = useMemo(() => {
    if (lastCheckout?.items?.length) {
      return lastCheckout.items;
    }
    return items;
  }, [items, lastCheckout]);

  const summary = useMemo(() => {
    if (lastCheckout?.summary) {
      return lastCheckout.summary;
    }
    const pricingItems = items.map((item) => {
      const product = productIndex?.get(String(item?.productId ?? item?.id ?? ""));
      return {
        ...item,
        category: item?.category || product?.category || "",
        categorySlug: item?.categorySlug || product?.categorySlug || "",
        packaging: item?.packaging || product?.packaging || "",
      };
    });
    const baseSummary = computeCartSummary(pricingItems, summaryConfig);
    return applyStoredPromoToSummary(baseSummary, promoState);
  }, [items, lastCheckout, productIndex, promoState, summaryConfig]);

  return (
    <aside
      className={`checkout-summary${lastCheckout ? " checkout-summary--completed" : ""}`}
      aria-labelledby="checkout-summary-heading"
    >
      <h2 id="checkout-summary-heading">{copy.checkout.summaryHeading}</h2>
      <ul className="checkout-summary__list">
        {itemsToRender.length ? (
          itemsToRender.map((item, index) => {
            const key = item?.id != null ? String(item.id) : `${item?.name ?? "item"}-${index}`;
            const product = productIndex?.get(String(item?.productId ?? item?.id ?? ""));
            const price = Number(item?.price) || Number(product?.price) || 0;
            const quantity = Number(item?.quantity) || Number(item?.orderCount) || Number(item?.orderSize) || 1;
            const image = resolveProductImage(item?.image, product?.image);
            return (
              <li key={key}>
                <div className="checkout-summary__item">
                  <span className="checkout-summary__thumb">
                    <Image
                      src={image}
                      alt=""
                      width={56}
                      height={56}
                      sizes="56px"
                      loading="lazy"
                    />
                  </span>
                  <span>
                    <span className="checkout-summary__name">{item?.name ?? "Fresh produce"}</span>
                    <span className="checkout-summary__unit">
                      {formatQuantity(quantity)} {product?.unit || item?.unit || "item"}
                    </span>
                  </span>
                </div>
                <span>{formatProductPrice(price, product?.unit)}</span>
              </li>
            );
          })
        ) : (
          <li className="checkout-summary__empty">{copy.checkout.emptyDescription}</li>
        )}
      </ul>

      <div className="checkout-summary__totals">
        <div>
          <span>{copy.checkout.labels.subtotal}</span>
          <span>{formatProductPrice(summary.subtotal)}</span>
        </div>
        <div>
          <span>{copy.checkout.labels.packaging}</span>
          <span>{Number(summary.packagingFee || 0) === 0 ? copy.checkout.freeDeliveryLabel : formatProductPrice(summary.packagingFee)}</span>
        </div>
        {summary.handlingFee > 0 ? (
          <div>
            <span>Small order handling</span>
            <span>{formatProductPrice(summary.handlingFee)}</span>
          </div>
        ) : null}
        <div>
          <span>
            {copy.checkout.labels.delivery}
            {fulfillmentType === "pickup" ? <small className="checkout-summary__dispatch">Customer pickup</small> : deliveryUnavailable ? null : (
              <small className="checkout-summary__dispatch">{selectedDispatchOption?.name || "Select a partner"}</small>
            )}
          </span>
          <span>
            {fulfillmentType === "pickup" ? "Free" : deliveryUnavailable
              ? "Unavailable"
              : summary.deliveryFee === 0
              ? copy.checkout.freeDeliveryLabel
              : formatProductPrice(summary.deliveryFee)}
          </span>
        </div>
        {summary.discountTotal > 0 ? (
          <div className="checkout-summary__savings">
            <span>{summary.promoCode ? `Discount (${summary.promoCode})` : "Discount"}</span>
            <span>-{formatProductPrice(summary.discountTotal)}</span>
          </div>
        ) : null}
        <div className="checkout-summary__totals--strong">
          <span>{copy.checkout.labels.total}</span>
          <span>{formatProductPrice(summary.total)}</span>
        </div>
      </div>

      {submitFormId ? (
        <div className="checkout-summary__actions">
          <button type="submit" form={submitFormId} className="checkout-submit">
            <i className="fa-solid fa-lock" aria-hidden="true" />
            {copy.checkout.completeOrder}
          </button>
          <p className="checkout-summary__secure">
            <i className="fa-solid fa-shield-halved" aria-hidden="true" />
            Encrypted & secure - Free returns within 24h
          </p>
        </div>
      ) : null}

      <details className="checkout-summary__policy">
        <summary>
          <span>Delivery policy</span>
          <i className="fa-solid fa-chevron-down" aria-hidden="true" />
        </summary>
        <div className="checkout-summary__policy-body">
          <p>
            Meal05 currently delivers within the Akala Express Launch Zone in Ibadan, including Elebu, Akala Express,
            Oluyole Estate, New Garage, Challenge, Ring Road and Odo-Ona.
          </p>
          <p>
            Orders placed by <strong>2:00 PM</strong> are targeted for same-day delivery between <strong>4:00 PM and
            7:00 PM</strong>. Orders placed after cut-off usually move to the next delivery cycle.
          </p>
          <p>
            Delivery and packaging fees are shown separately at checkout. If an item becomes unavailable during
            same-day sourcing, we may offer a replacement or refund the affected item.
          </p>
          <p>
            Review the full <Link href="/delivery-policy">Delivery Policy</Link>.
          </p>
        </div>
      </details>
    </aside>
  );
}
