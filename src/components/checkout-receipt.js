"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import copy from "@/data/copy";
import { formatProductPrice } from "@/lib/catalogue";
import { clearCheckoutReceipt, readCheckoutReceipt } from "@/lib/checkout";

const paymentLabels = copy.checkout.paymentMethods.reduce((acc, method) => {
  acc[method.value] = method.title;
  return acc;
}, {});

const deliveryLabels = copy.checkout.deliverySlots;

const getDeliverySlotLabel = (slot) => deliveryLabels[slot] ?? slot;
const getPaymentMethodLabel = (method) => paymentLabels[method] ?? method;

function renderItems(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="checkout-confirmation__items">
      <h3>{copy.checkout.confirmation.itemsHeading}</h3>
      <ul>
        {items.map((item, index) => {
          const key = item?.id != null ? String(item.id) : `${item?.name ?? "item"}-${index}`;
          const quantity =
            Number(item?.quantity) || Number(item?.orderCount) || Number(item?.orderSize) || 1;
          return (
            <li key={key}>
              <span>{item?.name ?? "Fresh produce"}</span>
              <span>{`x${quantity.toLocaleString()}`}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function CheckoutReceipt({ status = "success", reason }) {
  const [receipt, setReceipt] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    const stored = readCheckoutReceipt();
    setReceipt(stored);
    setLoaded(true);
    setShowOverlay(true);
    return () => {
      if (status === "success") {
        clearCheckoutReceipt();
      }
    };
  }, [status]);

  const summary = receipt?.summary ?? { subtotal: 0, total: 0, deliveryFee: 0 };
  const deliverySlot = getDeliverySlotLabel(receipt?.deliverySlot);
  const paymentLabel = getPaymentMethodLabel(receipt?.paymentMethod);

  const heading =
    status === "failure" ? copy.checkout.receiptPage.failureHeading : copy.checkout.receiptPage.successHeading;
  const subheading =
    status === "failure" ? copy.checkout.receiptPage.failureSubheading : copy.checkout.receiptPage.successSubheading;

  if (!loaded) {
    return (
      <div className="checkout-state" role="status">
        <span className="checkout-state__spinner" aria-hidden="true" />
        <p>Preparing your receipt...</p>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="checkout-empty" role="alert">
        <h2>{copy.checkout.receiptPage.missingTitle}</h2>
        <p>{copy.checkout.receiptPage.missingDescription}</p>
        <div className="checkout-empty__actions">
          <Link href="/checkout" className="checkout-empty__cta">
            {copy.checkout.receiptPage.backToCheckout}
          </Link>
          <Link href="/shop" className="checkout-empty__secondary">
            {copy.checkout.receiptPage.viewOrders}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {showOverlay ? (
        <div className="checkout-status-overlay" role="alert" aria-live="assertive">
          <div className={`checkout-status-overlay__card checkout-status-overlay__card--${status}`}>
            <div className="checkout-status-overlay__icon" aria-hidden="true">
              {status === "success" ? "OK" : "X"}
            </div>
            <div className="checkout-status-overlay__body">
              <h2>{status === "success" ? "Payment successful" : "Payment unsuccessful"}</h2>
              <p>
                {status === "success"
                  ? "Your order is confirmed. We are preparing it now."
                  : reason || "We could not confirm your payment. Please try again."}
              </p>
              <button type="button" onClick={() => setShowOverlay(false)} className="checkout-status-overlay__close">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="checkout-card checkout-confirmation" role="status" aria-live="polite">
        <div className="checkout-confirmation__header">
          <h2>{heading}</h2>
          <p>{subheading}</p>
          {status === "failure" && reason ? <p className="checkout-summary__unit">{reason}</p> : null}
        </div>

        <dl className="checkout-confirmation__details">
          <div>
            <dt>{copy.checkout.confirmation.orderIdLabel}</dt>
            <dd>{receipt.orderId}</dd>
          </div>
          <div>
            <dt>{copy.checkout.confirmation.deliverySlotLabel}</dt>
            <dd>{deliverySlot}</dd>
          </div>
          <div>
            <dt>{copy.checkout.confirmation.paymentMethodLabel}</dt>
            <dd>{paymentLabel}</dd>
          </div>
          <div>
            <dt>{copy.checkout.confirmation.totalLabel}</dt>
            <dd>{formatProductPrice(summary.total)}</dd>
          </div>
        </dl>

        {renderItems(receipt.items)}

        <div className="checkout-confirmation__notice">
          <ul>
            <li>
              <span>{copy.checkout.labels.subtotal}</span>
              <span>{formatProductPrice(summary.subtotal)}</span>
            </li>
            <li>
              <span>{copy.checkout.labels.delivery}</span>
              <span>
                {summary.deliveryFee === 0
                  ? copy.checkout.freeDeliveryLabel
                  : formatProductPrice(summary.deliveryFee)}
              </span>
            </li>
            {summary.discountTotal > 0 ? (
              <li>
                <span>{summary.promoCode ? `Discount (${summary.promoCode})` : "Discount"}</span>
                <span>-{formatProductPrice(summary.discountTotal)}</span>
              </li>
            ) : null}
            <li>
              <span>{copy.checkout.confirmation.totalLabel}</span>
              <span>{formatProductPrice(summary.total)}</span>
            </li>
          </ul>
        </div>

        <div className="checkout-confirmation__actions">
          <Link href="/shop" className="checkout-confirmation__action">
            {copy.checkout.receiptPage.viewOrders}
          </Link>
          {status === "failure" ? (
            <Link href="/checkout" className="checkout-confirmation__action checkout-confirmation__action--secondary">
              {copy.checkout.receiptPage.tryAgain}
            </Link>
          ) : (
            <Link href="/checkout" className="checkout-confirmation__action checkout-confirmation__action--secondary">
              {copy.checkout.receiptPage.backToCheckout}
            </Link>
          )}
          <Link href="tel:+2349129296433" className="checkout-confirmation__action checkout-confirmation__action--secondary">
            {copy.checkout.receiptPage.contactSupport}
          </Link>
        </div>
      </section>
    </>
  );
}
