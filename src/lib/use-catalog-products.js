"use client";

import { useEffect, useMemo, useState } from "react";

import { normaliseProductCatalogue } from "@/lib/catalogue";

const inFlightRequests = new Map();
const catalogueValueCache = new Map();
const CATALOGUE_CACHE_TTL_MS = 60 * 1000;

const EMPTY_LOOKUP = {
  catalogue: {},
  ordered: [],
  index: new Map(),
  pagination: null,
};

const normaliseIds = (ids = []) => {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

// Catalogue/card payloads are intentionally lightweight and some legacy feeds can
// contain variations without the authoritative product-level commerce metadata
// (selection_model / variation_note) or variant availability/inventory modes.
// Quick Add treats optionsLoaded=true as permission to skip /api/products/:id, so
// never advertise catalogue-card options as canonical. The drawer can still paint
// its card fallback immediately, then refresh the authoritative product endpoint.
const requireCanonicalQuickAddMetadata = (product) =>
  product && typeof product === "object"
    ? { ...product, optionsLoaded: false }
    : product;

const buildLookup = (payload, orderedIds = []) => {
  const catalogue = payload?.grouped || {};
  const lookup = normaliseProductCatalogue(catalogue);
  const canonicalOrdered = lookup.ordered.map(requireCanonicalQuickAddMetadata);
  const canonicalIndex = new Map(
    canonicalOrdered
      .filter((product) => product?.id != null)
      .map((product) => [String(product.id), product])
  );

  if (!orderedIds.length) {
    return {
      catalogue,
      ordered: canonicalOrdered,
      index: canonicalIndex,
      pagination: payload?.pagination || null,
    };
  }

  const ordered = orderedIds.map((id) => canonicalIndex.get(String(id))).filter(Boolean);
  return { catalogue, ordered, index: canonicalIndex, pagination: payload?.pagination || null };
};

const fetchCatalog = async (url, orderedIds = [], { refresh = false } = {}) => {
  const cached = catalogueValueCache.get(url);
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.value;
  if (refresh) catalogueValueCache.delete(url);
  if (inFlightRequests.has(url)) return inFlightRequests.get(url);
  const request = fetch(url, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => buildLookup(payload, orderedIds))
    .then((lookup) => {
      catalogueValueCache.set(url, {
        value: lookup,
        expiresAt: Date.now() + CATALOGUE_CACHE_TTL_MS,
      });
      return lookup;
    })
    .finally(() => {
      inFlightRequests.delete(url);
    });
  inFlightRequests.set(url, request);
  return request;
};

export const prefetchCatalogProducts = (url) => {
  if (!url) return Promise.resolve(EMPTY_LOOKUP);
  return fetchCatalog(url).catch(() => EMPTY_LOOKUP);
};

export function useCatalogProducts(url = "/api/catalog/home?limit=72") {
  const [state, setState] = useState(() => ({
    ...EMPTY_LOOKUP,
    status: !url ? "ready" : "loading",
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setState({ ...EMPTY_LOOKUP, status: "ready", error: null });
      return () => {
        cancelled = true;
      };
    }
    const load = (refresh = false) => {
      setState((current) => ({ ...current, status: "loading", error: null }));
      fetchCatalog(url, [], { refresh })
        .then((lookup) => {
          if (!cancelled) setState({ ...lookup, status: "ready", error: null });
        })
        .catch((error) => {
          if (!cancelled) setState({ ...EMPTY_LOOKUP, status: "error", error });
        });
    };
    load();
    if (typeof window !== "undefined") {
      const refresh = () => load(true);
      window.addEventListener("catalogue-refresh", refresh);
      window.addEventListener("checkout-completed", refresh);
      return () => {
        cancelled = true;
        window.removeEventListener("catalogue-refresh", refresh);
        window.removeEventListener("checkout-completed", refresh);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}

export function useProductsByIds(ids = []) {
  const orderedIds = useMemo(() => normaliseIds(ids), [ids]);
  const key = orderedIds.join(",");
  const url = key ? `/api/products/by-ids?ids=${encodeURIComponent(key)}` : "";
  const [state, setState] = useState(() => ({
    ...EMPTY_LOOKUP,
    requestKey: key,
    status: key ? "loading" : "ready",
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setState({ ...EMPTY_LOOKUP, requestKey: "", status: "ready", error: null });
      return () => {
        cancelled = true;
      };
    }

    setState((current) => ({ ...current, requestKey: key, status: "loading", error: null }));
    fetchCatalog(url, orderedIds)
      .then((lookup) => {
        if (!cancelled) setState({ ...lookup, requestKey: key, status: "ready", error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ ...EMPTY_LOOKUP, requestKey: key, status: "error", error });
      });

    return () => {
      cancelled = true;
    };
  }, [key, orderedIds, url]);

  if (key && state.requestKey !== key) {
    return { ...state, status: "loading" };
  }
  return state;
}
