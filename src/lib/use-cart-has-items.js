"use client";

import { useEffect, useState } from "react";

import { AUTH_EVENT } from "@/lib/auth";
import { CART_UPDATED_EVENT, readCartItems } from "@/lib/cart-storage";

const cartHasItems = () =>
  readCartItems().some((item) => {
    if (!item || typeof item !== "object") return false;
    const count = Number(item.quantity || item.orderCount || 0);
    return count > 0 || Boolean(item.id || item.productId || item.variantId);
  });

export function useCartHasItems(enabled = true) {
  const [hasItems, setHasItems] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setHasItems(null);
      return undefined;
    }

    const update = () => setHasItems(cartHasItems());

    update();
    window.addEventListener("storage", update);
    window.addEventListener(CART_UPDATED_EVENT, update);
    window.addEventListener(AUTH_EVENT, update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener(CART_UPDATED_EVENT, update);
      window.removeEventListener(AUTH_EVENT, update);
    };
  }, [enabled]);

  return hasItems;
}
