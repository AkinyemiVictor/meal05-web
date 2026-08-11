"use client";

import { readStoredUser } from "./auth";
import { trackAddToCart } from "./analytics";
import { roundQuantity } from "./purchase-quantities";

const BASE_KEY = "meal05_cart";
export const CART_UPDATED_EVENT = "cart-updated";
export const CART_ADDED_EVENT = "meal05:cart-added";
const GUEST_KEY = `${BASE_KEY}_guest`;

const normaliseEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const roundToTwo = (value) => roundQuantity(value);

const getLineKey = (item) =>
  String(item?.variantId || item?.id || item?.productId || "").trim();

const getLineQuantity = (item) => {
  const orderSize = Number(item?.orderSize);
  const orderCount = Number(item?.orderCount);
  if (Number.isFinite(orderSize) && orderSize > 0 && Number.isFinite(orderCount) && orderCount > 0) {
    return roundToTwo(orderSize * orderCount);
  }

  const quantity = Number(item?.quantity);
  if (Number.isFinite(quantity) && quantity > 0) return roundToTwo(quantity);

  if (Number.isFinite(orderCount) && orderCount > 0) return roundToTwo(orderCount);
  return 0;
};

const getLineCount = (item) => {
  const orderCount = Number(item?.orderCount ?? item?.quantity);
  if (Number.isFinite(orderCount) && orderCount > 0) return Math.max(0.001, roundQuantity(orderCount));
  return 1;
};

const mergeCartLines = (baseItems, incomingItems) => {
  const merged = Array.isArray(baseItems) ? baseItems.map((item) => ({ ...item })) : [];
  (Array.isArray(incomingItems) ? incomingItems : []).forEach((incoming) => {
    if (!incoming || typeof incoming !== "object") return;
    const incomingKey = getLineKey(incoming);
    const incomingProductKey = String(incoming?.productId || incoming?.id || "").trim();
    const index = merged.findIndex((item) => {
      const itemKey = getLineKey(item);
      const itemProductKey = String(item?.productId || item?.id || "").trim();
      return (
        (incomingKey && itemKey === incomingKey) ||
        (!incoming?.variantId && incomingProductKey && itemProductKey === incomingProductKey)
      );
    });

    if (index >= 0) {
      const current = merged[index];
      const nextCount = getLineCount(current) + getLineCount(incoming);
      merged[index] = {
        ...current,
        ...incoming,
        orderCount: nextCount,
        quantity: nextCount,
        note: current.note || incoming.note,
      };
      return;
    }

    merged.push({ ...incoming });
  });
  return merged;
};

const trackCartAdditions = (previousItems, nextItems, options = {}) => {
  if (typeof window === "undefined") return;
  if (options?.source === "guest-migration") return;

  const previousByKey = new Map();
  (Array.isArray(previousItems) ? previousItems : []).forEach((item) => {
    const key = getLineKey(item);
    if (!key) return;
    previousByKey.set(key, getLineQuantity(item));
  });

  const additions = [];
  (Array.isArray(nextItems) ? nextItems : []).forEach((item) => {
    const key = getLineKey(item);
    if (!key) return;
    const previousQuantity = Number(previousByKey.get(key)) || 0;
    const nextQuantity = getLineQuantity(item);
    const delta = roundToTwo(nextQuantity - previousQuantity);
    if (!(delta > 0)) return;
    additions.push({ ...item, quantity: delta });
  });

  if (additions.length) {
    if (!options?.skipAnalytics) trackAddToCart(additions);
    if (!options?.skipAnalytics || options?.showCartFeedback) {
      dispatchCartAddedEvent({ items: additions, source: options?.source || "" });
    }
  }
};

export const getCartStorageKeyForUser = (user = readStoredUser()) => {
  const emailKey = normaliseEmail(user?.email);
  return emailKey ? `${BASE_KEY}_${emailKey}` : GUEST_KEY;
};

const readRawCart = (user) => {
  if (typeof window === "undefined") return [];
  try {
    const key = getCartStorageKeyForUser(user);
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Unable to read cart data", error);
    return [];
  }
};

const writeRawCart = (items, user, detail) => {
  if (typeof window === "undefined") return false;
  try {
    const key = getCartStorageKeyForUser(user);
    window.localStorage.setItem(key, JSON.stringify(items ?? []));
    dispatchCartUpdatedEvent(detail);
    return true;
  } catch (error) {
    console.warn("Unable to persist cart data", error);
    return false;
  }
};

export const readCartItems = (user) => readRawCart(user);

export const writeCartItems = (items, user, options = {}) => {
  if (!Array.isArray(items)) {
    throw new TypeError("Cart payload must be an array");
  }
  const previousItems = readRawCart(user);
  const persisted = writeRawCart(items, user, options);
  if (persisted) {
    trackCartAdditions(previousItems, items, options);
  }
};

export const clearCartItems = (user, options = {}) => {
  if (typeof window === "undefined") return;
  try {
    const key = getCartStorageKeyForUser(user);
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("Unable to clear cart data", error);
  }
  dispatchCartUpdatedEvent(options);
};

export const migrateGuestCartToUser = (user = readStoredUser()) => {
  if (typeof window === "undefined") return [];
  const guestCart = readRawCart(null);
  if (!guestCart.length) return [];
  const userCart = readRawCart(user);
  writeRawCart(mergeCartLines(userCart, guestCart), user, { source: "guest-migration" });
  clearCartItems(null, { source: "guest-migration" });
  return guestCart;
};

export const dispatchCartUpdatedEvent = (detail) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail }));
  } catch (error) {
    console.warn("Unable to dispatch cart event", error);
  }
};

export const dispatchCartAddedEvent = (detail) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(CART_ADDED_EVENT, { detail }));
  } catch (error) {
    console.warn("Unable to dispatch cart feedback event", error);
  }
};
