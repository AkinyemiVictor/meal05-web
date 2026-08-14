"use client";

import { useEffect, useState } from "react";

let categoriesRequestCache = null;
let categoriesValueCache = null;
let categoriesCachedAt = 0;

const CATEGORY_FRESH_MS = 5 * 60 * 1000;

const fetchCategories = async ({ refresh = false } = {}) => {
  const isFresh = categoriesValueCache && Date.now() - categoriesCachedAt < CATEGORY_FRESH_MS;
  if (!refresh && isFresh) return categoriesValueCache;
  if (!refresh && categoriesRequestCache) return categoriesRequestCache;
  categoriesRequestCache = fetch("/api/categories")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      categoriesValueCache = Array.isArray(payload?.categories) ? payload.categories : [];
      categoriesCachedAt = Date.now();
      categoriesRequestCache = null;
      return categoriesValueCache;
    })
    .catch((error) => {
      categoriesRequestCache = null;
      throw error;
    });
  return categoriesRequestCache;
};

export const prefetchCategories = () => fetchCategories().catch(() => []);

export default function useCategories() {
  const [categories, setCategories] = useState(() => categoriesValueCache || []);
  const [status, setStatus] = useState(() => (categoriesValueCache ? "ready" : "loading"));
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus(categoriesValueCache ? "ready" : "loading");
    const load = (refresh = false) => fetchCategories({ refresh })
      .then((nextCategories) => {
        if (cancelled) return;
        setCategories(nextCategories);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setCategories([]);
        setError(err);
        setStatus("error");
      });
    if (categoriesValueCache) {
      // Stale-while-revalidate: render the last category navigation instantly,
      // then refresh counts without replacing it with a loading state.
      load(Date.now() - categoriesCachedAt >= CATEGORY_FRESH_MS);
    } else {
      load();
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, status, error };
}
