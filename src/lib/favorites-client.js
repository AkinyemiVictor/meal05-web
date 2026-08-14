"use client";

import { readStoredUser } from "@/lib/auth";

export const FAVORITES_UPDATED_EVENT = "meal05:favorites-updated";

let cachedOwner = "";
let cachedFavoriteIds = null;
let inFlightRequest = null;

const getOwnerKey = () => {
  const user = readStoredUser();
  return String(user?.id || user?.email || "").trim().toLowerCase();
};

const normaliseIds = (ids) =>
  [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean))];

const resetCacheForCurrentUser = () => {
  const owner = getOwnerKey();
  if (owner !== cachedOwner) {
    cachedOwner = owner;
    cachedFavoriteIds = null;
    inFlightRequest = null;
  }
  return owner;
};

const broadcast = (ids) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FAVORITES_UPDATED_EVENT, { detail: { productIds: ids } }));
};

export const loadFavoriteIds = async ({ force = false } = {}) => {
  const owner = resetCacheForCurrentUser();
  if (!owner) return [];
  if (!force && cachedFavoriteIds) return [...cachedFavoriteIds];
  if (inFlightRequest) return inFlightRequest;

  inFlightRequest = fetch("/api/favorites", { cache: "no-store" })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to load Favorites.");
      const ids = normaliseIds(payload?.productIds);
      cachedFavoriteIds = ids;
      return [...ids];
    })
    .finally(() => {
      inFlightRequest = null;
    });
  return inFlightRequest;
};

export const updateFavoriteIds = (update) => {
  resetCacheForCurrentUser();
  const current = Array.isArray(cachedFavoriteIds) ? cachedFavoriteIds : [];
  const next = normaliseIds(typeof update === "function" ? update([...current]) : update);
  cachedFavoriteIds = next;
  broadcast(next);
  return next;
};
