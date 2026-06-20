"use client";

import { readStoredUser } from "./auth";
import { trackAddToCart } from "./analytics";

const BASE_KEY = "meal05_cart";
export const CART_UPDATED_EVENT = "cart-updated";
const GUEST_KEY = `${BASE_KEY}_guest`;

const normaliseEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const roundToTwo = (value) => Math.round(Number(value || 0) * 100) / 100;

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

const trackCartAdditions = (previousItems, nextItems, options = {}) => {
  if (typeof window === "undefined") return;
  if (options?.skipAnalytics) return;
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
    trackAddToCart(additions);
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
  if (typeof window === "undefined") return;
  const guestCart = readRawCart(null);
  if (!guestCart.length) return;
  const userCart = readRawCart(user);
  if (userCart.length) return;
  writeRawCart(guestCart, user, { source: "guest-migration" });
  clearCartItems(null);
};

export const dispatchCartUpdatedEvent = (detail) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail }));
  } catch (error) {
    console.warn("Unable to dispatch cart event", error);
  }
};
