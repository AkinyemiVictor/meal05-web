"use client";

export const CART_UPDATED_EVENT = "cart-updated";

export const readCartItems = () => [];

export const writeCartItems = (_items, _userId, options = {}) => {
  dispatchCartUpdatedEvent({ source: options?.source || "cart-storage-disabled" });
};

export const clearCartItems = () => {
  dispatchCartUpdatedEvent({ source: "cart-storage-disabled" });
};

export const migrateGuestCartToUser = () => {};

export const dispatchCartUpdatedEvent = (detail) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail }));
  } catch (error) {
    console.warn("Unable to dispatch cart event", error);
  }
};
