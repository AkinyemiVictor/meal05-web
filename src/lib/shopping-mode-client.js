"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SHOPPING_MODE_COOKIE,
  SHOPPING_MODE_EVENT,
  SHOPPING_MODE_HOUSEHOLD,
  SHOPPING_MODE_STORAGE_KEY,
  normalizeShoppingMode,
} from "@/lib/shopping-mode";

export const readShoppingModeSelection = () => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(SHOPPING_MODE_STORAGE_KEY);
    return stored ? normalizeShoppingMode(stored) : null;
  } catch {
    return null;
  }
};

export const readShoppingMode = () =>
  readShoppingModeSelection() || SHOPPING_MODE_HOUSEHOLD;

export const writeShoppingMode = (value) => {
  if (typeof window === "undefined") return;
  const mode = normalizeShoppingMode(value);
  try {
    window.localStorage.setItem(SHOPPING_MODE_STORAGE_KEY, mode);
  } catch {}
  document.cookie = `${SHOPPING_MODE_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new CustomEvent(SHOPPING_MODE_EVENT, { detail: { mode } }));
  window.dispatchEvent(new CustomEvent("catalogue-refresh", { detail: { mode } }));
  return mode;
};

export function useShoppingMode() {
  const [state, setState] = useState({ mode: SHOPPING_MODE_HOUSEHOLD, selected: false, ready: false });

  useEffect(() => {
    const sync = () => {
      const selection = readShoppingModeSelection();
      setState({ mode: selection || SHOPPING_MODE_HOUSEHOLD, selected: Boolean(selection), ready: true });
    };
    sync();
    window.addEventListener(SHOPPING_MODE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SHOPPING_MODE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const selectMode = useCallback((mode) => writeShoppingMode(mode), []);
  return { ...state, selectMode };
}
