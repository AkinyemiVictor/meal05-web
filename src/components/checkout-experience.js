"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import CheckoutForm from "@/components/checkout-form";
import CheckoutSummary from "@/components/checkout-summary";
import copy from "@/data/copy";
import { readStoredCart } from "@/lib/checkout";
import useDeliverySettings from "@/lib/use-delivery-settings";

export default function CheckoutExperience() {
  const { settings: deliverySettings } = useDeliverySettings();
  const [hasItems, setHasItems] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [deliveryCity, setDeliveryCity] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const evaluateCart = () => {
      const stored = readStoredCart();
      setHasItems(stored.length > 0);
      setIsHydrated(true);
    };

    evaluateCart();

    const handleCartUpdated = () => evaluateCart();
    window.addEventListener("storage", handleCartUpdated);
    window.addEventListener("cart-updated", handleCartUpdated);

    return () => {
      window.removeEventListener("storage", handleCartUpdated);
      window.removeEventListener("cart-updated", handleCartUpdated);
    };
  }, []);

  if (!isHydrated) {
    return (
      <div className="checkout-state" role="status">
        <span className="checkout-state__spinner" aria-hidden="true" />
        <p>Loading your cart...</p>
      </div>
    );
  }

  if (!hasItems) {
    return (
      <div className="checkout-empty" role="alert">
        <h2>{copy.checkout.emptyTitle}</h2>
        <p>{copy.checkout.emptyDescription}</p>
        <div className="checkout-empty__actions">
          <Link href="/shop" className="checkout-empty__cta">
            {copy.checkout.emptyCta}
          </Link>
          <Link href="/cart" className="checkout-empty__secondary">
            {copy.checkout.backToCart}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-grid">
      <CheckoutForm deliverySettings={deliverySettings} onCityChange={setDeliveryCity} />
      <CheckoutSummary deliverySettings={deliverySettings} deliveryCity={deliveryCity} />
    </div>
  );
}
