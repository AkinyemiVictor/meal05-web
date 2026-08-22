"use client";

import { useEffect, useState } from "react";

import { AUTH_EVENT, readStoredUser } from "@/lib/auth";
import { readCartItems } from "@/lib/cart-storage";

const REMOTE_COUNT_REUSE_MS = 2000;

let inFlightRequest = null;
let lastRemoteCount = null;
let lastRemoteCountAt = 0;

const countItems = (items) =>
  (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + Number(item.quantity || item.orderCount || 0),
    0
  );

const readLocalCount = () => countItems(readCartItems());

const loadRemoteCount = ({ force = false } = {}) => {
  if (!readStoredUser()) return Promise.resolve(null);

  const now = Date.now();
  if (
    !force &&
    Number.isFinite(lastRemoteCount) &&
    now - lastRemoteCountAt < REMOTE_COUNT_REUSE_MS
  ) {
    return Promise.resolve(lastRemoteCount);
  }

  // All mounted cart badges share the same in-flight request. This prevents the
  // mobile header, desktop header, and bottom navigation from independently
  // hitting /api/cart during the same page/auth event.
  if (inFlightRequest) return inFlightRequest;

  inFlightRequest = fetch("/api/cart", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((items) => {
      if (!Array.isArray(items)) return null;
      const count = countItems(items);
      lastRemoteCount = count;
      lastRemoteCountAt = Date.now();
      return count;
    })
    .catch(() => null)
    .finally(() => {
      inFlightRequest = null;
    });

  return inFlightRequest;
};

export default function useSharedCartCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const update = (event) => {
      setCount(readLocalCount());
      if (!readStoredUser()) return;

      const forceRemote = event?.type === "cart-updated" || event?.type === "storage";
      loadRemoteCount({ force: forceRemote }).then((remoteCount) => {
        if (cancelled || !Number.isFinite(remoteCount)) return;
        setCount(remoteCount);
      });
    };

    update();
    window.addEventListener("storage", update);
    window.addEventListener("cart-updated", update);
    window.addEventListener(AUTH_EVENT, update);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", update);
      window.removeEventListener("cart-updated", update);
      window.removeEventListener(AUTH_EVENT, update);
    };
  }, []);

  return count;
}
