"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

import copy from "@/data/copy";
import { readStoredCart } from "@/lib/checkout";
import { readStoredUser } from "@/lib/auth";
import { fetchCanonicalCart } from "@/lib/cart-sync";
import { LOCATION_EVENT, readStoredLocationPreference } from "@/lib/location-preferences";
import useDeliverySettings from "@/lib/use-delivery-settings";

function CheckoutLoadingState() {
  return (
    <div className="checkout-state" role="status">
      <span className="checkout-state__spinner" aria-hidden="true" />
      <p>Loading your cart...</p>
    </div>
  );
}

const CheckoutWorkspace = dynamic(() => import("@/components/checkout-workspace"), {
  ssr: false,
  loading: () => <CheckoutLoadingState />,
});

export default function CheckoutExperience() {
  const { settings: deliverySettings } = useDeliverySettings();
  const [hasItems, setHasItems] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [deliveryCity, setDeliveryCity] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState("delivery");
  const [dispatchOptions, setDispatchOptions] = useState([]);
  const [dispatchOptionId, setDispatchOptionId] = useState("");
  const [pickupLocations, setPickupLocations] = useState([]);
  const [pickupLocationId, setPickupLocationId] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    const evaluateCart = () => {
      const stored = readStoredCart();
      setHasItems(stored.length > 0);
      setIsHydrated(true);
    };

    const loadCart = async () => {
      if (!readStoredUser()) {
        evaluateCart();
        return;
      }
      try {
        const cart = await fetchCanonicalCart({ source: "checkout-server-cart" });
        if (!cancelled) {
          setHasItems(cart.length > 0);
          setIsHydrated(true);
        }
      } catch {
        if (!cancelled) evaluateCart();
      }
    };

    void loadCart();

    const handleCartUpdated = () => evaluateCart();
    window.addEventListener("storage", handleCartUpdated);
    window.addEventListener("cart-updated", handleCartUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleCartUpdated);
      window.removeEventListener("cart-updated", handleCartUpdated);
    };
  }, []);

  useEffect(() => {
    fetch("/api/fulfillment/options", { cache: "no-store" }).then(r => r.json()).then(data => {
      const locations = data.pickupLocations || []; setPickupLocations(locations);
      if (locations[0]) setPickupLocationId(String(locations[0].id));
    }).catch(() => {});
    const loadQuotes = () => {
      const location = readStoredLocationPreference();
      if (!location?.serviceable || !location?.coords) { setDispatchOptions([]); setDispatchOptionId(""); return; }
      fetch("/api/fulfillment/options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(location.coords) })
        .then(r => r.json()).then(data => { const quotes = data.quotes || []; setDispatchOptions(quotes); setDispatchOptionId(String((quotes.find(q => q.recommended) || quotes[0])?.id || "")); }).catch(() => setDispatchOptions([]));
    };
    loadQuotes(); window.addEventListener(LOCATION_EVENT, loadQuotes);
    return () => window.removeEventListener(LOCATION_EVENT, loadQuotes);
  }, []);

  if (!isHydrated) {
    return <CheckoutLoadingState />;
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
    <CheckoutWorkspace
      deliverySettings={deliverySettings}
      deliveryCity={deliveryCity}
      dispatchOptionId={dispatchOptionId}
      dispatchOptions={dispatchOptions}
      fulfillmentType={fulfillmentType}
      onFulfillmentChange={setFulfillmentType}
      pickupLocations={pickupLocations}
      pickupLocationId={pickupLocationId}
      onPickupLocationChange={setPickupLocationId}
      onCityChange={setDeliveryCity}
      onDispatchChange={setDispatchOptionId}
    />
  );
}
