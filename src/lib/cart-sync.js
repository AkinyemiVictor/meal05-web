"use client";

import { readCartItems, writeCartItems } from "./cart-storage";
import { readStoredUser } from "./auth";

const toApiItem = (item, operation = "increment") => ({
  product_id: item?.productId ?? item?.product_id,
  variant_id: item?.variantId ?? item?.variant_id,
  variant_name: item?.variantName ?? item?.variant_name,
  product_name: item?.name ?? item?.productName ?? item?.product_name,
  unit_price_at_add: Number(item?.price ?? item?.unit_price_at_add ?? 0),
  quantity: Number(item?.quantity ?? item?.orderCount ?? 1),
  operation,
});

const parseResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to update cart.");
  }
  return payload;
};

export const fetchCanonicalCart = async ({ signal, persist = true, source = "server-cart" } = {}) => {
  const response = await fetch("/api/cart", { cache: "no-store", signal });
  const cart = await parseResponse(response);
  const rows = Array.isArray(cart) ? cart : [];
  if (persist) writeCartItems(rows, undefined, { source, skipAnalytics: true });
  return rows;
};

export const addAuthenticatedCartItem = async (item, { source = "server-cart" } = {}) => {
  const response = await fetch("/api/cart", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toApiItem(item, "increment")),
  });
  const payload = await parseResponse(response);
  const cart = Array.isArray(payload?.cart) ? payload.cart : [];
  writeCartItems(cart, undefined, { source, skipAnalytics: true });
  return cart;
};

export const setAuthenticatedCartItem = async (item, { source = "server-cart" } = {}) => {
  const response = await fetch("/api/cart", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toApiItem(item, "set")),
  });
  const payload = await parseResponse(response);
  const cart = Array.isArray(payload?.cart) ? payload.cart : [];
  writeCartItems(cart, undefined, { source, skipAnalytics: true });
  return cart;
};

export const migrateLocalCartToEmptyServer = async ({ source = "server-cart" } = {}) => {
  if (!readStoredUser()) return readCartItems();

  const serverCart = await fetchCanonicalCart({ persist: false });
  if (serverCart.length) {
    writeCartItems(serverCart, undefined, { source, skipAnalytics: true });
    return serverCart;
  }

  const localCart = readCartItems();
  if (!localCart.length) {
    writeCartItems([], undefined, { source, skipAnalytics: true });
    return [];
  }

  let canonical = [];
  for (const item of localCart) {
    canonical = await addAuthenticatedCartItem(item, { source });
  }
  return canonical;
};

export const syncGuestAdditionsAfterSignIn = async (guestItems, { source = "guest-server-sync" } = {}) => {
  if (!readStoredUser()) return readCartItems();

  const serverCart = await fetchCanonicalCart({ persist: false });
  if (!serverCart.length) return migrateLocalCartToEmptyServer({ source });

  if (!Array.isArray(guestItems) || !guestItems.length) {
    writeCartItems(serverCart, undefined, { source, skipAnalytics: true });
    return serverCart;
  }

  let canonical = [];
  for (const item of guestItems) {
    canonical = await addAuthenticatedCartItem(item, { source });
  }
  return canonical;
};
