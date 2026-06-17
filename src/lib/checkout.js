import { clearCartItems, dispatchCartUpdatedEvent, readCartItems, writeCartItems } from "./cart-storage";
import {
  DEFAULT_DELIVERY_FEE,
  DEFAULT_FREE_DELIVERY_THRESHOLD,
  applyPromoToOrderSummary,
  computeOrderSummary,
} from "./order-pricing";

export const readStoredCart = () => readCartItems();

export const writeStoredCart = (items) => {
  if (!Array.isArray(items)) {
    throw new TypeError("Cart payload must be an array");
  }
  writeCartItems(items);
};

export const clearStoredCart = () => {
  clearCartItems();
};

export const dispatchCheckoutCompletedEvent = (detail) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("checkout-completed", { detail }));
  } catch (error) {
    console.warn("Unable to dispatch checkout-completed event", error);
  }
};

const CHECKOUT_PROMO_STORAGE_KEY = "meal05_checkout_promo";
export const CHECKOUT_PROMO_UPDATED_EVENT = "checkout-promo-updated";

export const computeCartSummary = (
  items,
  {
    freeDeliveryThreshold = DEFAULT_FREE_DELIVERY_THRESHOLD,
    deliveryFee = DEFAULT_DELIVERY_FEE,
  } = {}
) =>
  computeOrderSummary(items, {
    freeDeliveryThreshold,
    deliveryFee,
  });

export const applyStoredPromoToSummary = (summary, promoState) => applyPromoToOrderSummary(summary, promoState);

export const readStoredPromo = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CHECKOUT_PROMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.warn("Unable to read stored promo", error);
    return null;
  }
};

export const dispatchCheckoutPromoUpdatedEvent = (detail) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(CHECKOUT_PROMO_UPDATED_EVENT, { detail }));
  } catch (error) {
    console.warn("Unable to dispatch checkout promo event", error);
  }
};

export const writeStoredPromo = (promo) => {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(CHECKOUT_PROMO_STORAGE_KEY, JSON.stringify(promo ?? null));
    dispatchCheckoutPromoUpdatedEvent({ promo: promo ?? null });
    return true;
  } catch (error) {
    console.warn("Unable to persist promo", error);
    return false;
  }
};

export const clearStoredPromo = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CHECKOUT_PROMO_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to clear stored promo", error);
  }
  dispatchCheckoutPromoUpdatedEvent({ promo: null });
};

export const generateOrderId = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(Math.random() * 1e6)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");
  return `MK-${timestamp.slice(-5)}${random}`;
};

const RECEIPT_STORAGE_KEY = "meal05_checkout_receipt";

export const persistCheckoutReceipt = (order) => {
  if (typeof window === "undefined" || !order) return;
  try {
    window.sessionStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(order));
  } catch (error) {
    console.warn("Unable to persist checkout receipt", error);
  }
};

export const readCheckoutReceipt = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(RECEIPT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Unable to read checkout receipt", error);
    return null;
  }
};

export const clearCheckoutReceipt = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RECEIPT_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to clear checkout receipt", error);
  }
};

export { dispatchCartUpdatedEvent };
