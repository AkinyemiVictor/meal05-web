"use client";

import { useEffect, useState } from "react";

let categoriesRequestCache = null;
let categoriesValueCache = null;

const fetchCategories = async ({ refresh = false } = {}) => {
  if (!refresh && categoriesValueCache) return categoriesValueCache;
  if (!refresh && categoriesRequestCache) return categoriesRequestCache;
  categoriesRequestCache = fetch("/api/categories", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      categoriesValueCache = Array.isArray(payload?.categories) ? payload.categories : [];
      categoriesRequestCache = null;
      return categoriesValueCache;
    })
    .catch((error) => {
      categoriesRequestCache = null;
      throw error;
    });
  return categoriesRequestCache;
};

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
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, status, error };
}
