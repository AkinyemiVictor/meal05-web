"use client";

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
import { getDeliverySummaryConfig } from "@/lib/delivery-settings";
import useProducts from "@/lib/use-products";

export default function CheckoutSummary({ deliverySettings, deliveryCity }) {
  const { index: productIndex } = useProducts();
  const [items, setItems] = useState(() => readStoredCart());
  const [promoState, setPromoState] = useState(() => readStoredPromo());
  const [lastCheckout, setLastCheckout] = useState(null);

  const summaryConfig = useMemo(
    () => getDeliverySummaryConfig(deliverySettings, deliveryCity),
    [deliverySettings, deliveryCity]
  );

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
    const baseSummary = computeCartSummary(items, summaryConfig);
    return applyStoredPromoToSummary(baseSummary, promoState);
  }, [items, lastCheckout, promoState, summaryConfig]);

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
            const product = productIndex?.get(String(item?.id));
            const price = Number(item?.price) || Number(product?.price) || 0;
            return (
              <li key={key}>
                <div>
                  <span className="checkout-summary__name">{item?.name ?? "Fresh produce"}</span>
                  {product?.unit ? <span className="checkout-summary__unit">{product.unit}</span> : null}
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
          <span>{copy.checkout.labels.delivery}</span>
          <span>
            {summary.deliveryFee === 0
              ? copy.checkout.freeDeliveryLabel
              : formatProductPrice(summary.deliveryFee)}
          </span>
        </div>
        {summary.discountTotal > 0 ? (
          <div>
            <span>{summary.promoCode ? `Discount (${summary.promoCode})` : "Discount"}</span>
            <span>-{formatProductPrice(summary.discountTotal)}</span>
          </div>
        ) : null}
        <div className="checkout-summary__totals--strong">
          <span>{copy.checkout.labels.total}</span>
          <span>{formatProductPrice(summary.total)}</span>
        </div>
      </div>
    </aside>
  );
}
