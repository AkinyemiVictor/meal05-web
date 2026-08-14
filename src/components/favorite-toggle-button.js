"use client";

import { useEffect, useState } from "react";
import { IconHeart } from "@tabler/icons-react";

import { useNotice } from "@/components/notice-provider";
import { buildSignInHref } from "@/lib/auth-redirect";
import { readStoredUser } from "@/lib/auth";
import { FAVORITES_UPDATED_EVENT, loadFavoriteIds, updateFavoriteIds } from "@/lib/favorites-client";

export default function FavoriteToggleButton({ productId, productName, className = "", iconSize = 18 }) {
  const { showNotice } = useNotice();
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const id = String(productId || "").trim();
  const isFavorite = favoriteIds.includes(id);

  useEffect(() => {
    let cancelled = false;
    const sync = (ids) => {
      if (!cancelled) setFavoriteIds(Array.isArray(ids) ? ids : []);
    };
    loadFavoriteIds().then(sync).catch(() => sync([]));
    const handleUpdate = (event) => sync(event?.detail?.productIds);
    window.addEventListener(FAVORITES_UPDATED_EVENT, handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(FAVORITES_UPDATED_EVENT, handleUpdate);
    };
  }, []);

  const handleClick = async () => {
    if (!id || isSaving) return;
    if (!readStoredUser()) {
      const next = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/shop";
      const href = buildSignInHref({ tab: "login", next, hash: "loginForm" });
      showNotice({
        tone: "info",
        title: "Sign in required",
        message: "Create or sign in to save Favorites.",
        dismissText: "Later",
        actions: [{ label: "Sign in", variant: "primary", onClick: () => { window.location.href = href; } }],
      });
      return;
    }

    const wasFavorite = isFavorite;
    setIsSaving(true);
    updateFavoriteIds((current) =>
      wasFavorite ? current.filter((favoriteId) => favoriteId !== id) : [id, ...current]
    );
    try {
      const response = await fetch(
        wasFavorite ? `/api/favorites?productId=${encodeURIComponent(id)}` : "/api/favorites",
        {
          method: wasFavorite ? "DELETE" : "POST",
          cache: "no-store",
          headers: wasFavorite ? undefined : { "Content-Type": "application/json" },
          body: wasFavorite ? undefined : JSON.stringify({ productId: id }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to update Favorites.");
    } catch (error) {
      updateFavoriteIds((current) =>
        wasFavorite ? [id, ...current] : current.filter((favoriteId) => favoriteId !== id)
      );
      showNotice({
        tone: "error",
        title: "Favorites not updated",
        message: error?.message || "Please try again.",
        autoClose: true,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <button
      type="button"
      className={["favorite-toggle", className].filter(Boolean).join(" ")}
      onClick={handleClick}
      disabled={isSaving}
      aria-label={`${isFavorite ? "Remove" : "Save"} ${productName || "item"} ${isFavorite ? "from" : "to"} Favorites`}
      aria-pressed={isFavorite}
      aria-busy={isSaving}
    >
      <IconHeart size={iconSize} stroke={isFavorite ? 2.3 : 1.8} fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}
