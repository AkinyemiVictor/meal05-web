"use client";

import { useEffect, useMemo, useState } from "react";

import { normaliseProductCatalogue } from "@/lib/catalogue";

const responseCache = new Map();

const EMPTY_LOOKUP = {
  catalogue: {},
  ordered: [],
  index: new Map(),
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

const buildLookup = (payload, orderedIds = []) => {
  const catalogue = payload?.grouped || {};
  const lookup = normaliseProductCatalogue(catalogue);
  if (!orderedIds.length) return { catalogue, ordered: lookup.ordered, index: lookup.index };
  const ordered = orderedIds.map((id) => lookup.index.get(String(id))).filter(Boolean);
  return { catalogue, ordered, index: lookup.index };
};

const fetchCatalog = async (url, orderedIds = []) => {
  if (responseCache.has(url)) return responseCache.get(url);
  const request = fetch(url, { cache: "default" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => buildLookup(payload, orderedIds))
    .catch((error) => {
      responseCache.delete(url);
      throw error;
    });
  responseCache.set(url, request);
  return request;
};

export function useCatalogProducts(url = "/api/catalog/home?limit=72") {
  const [state, setState] = useState(() => ({
    ...EMPTY_LOOKUP,
    status: !url || responseCache.has(url) ? "ready" : "loading",
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
    setState((current) => ({ ...current, status: responseCache.has(url) ? current.status : "loading", error: null }));
    fetchCatalog(url)
      .then((lookup) => {
        if (!cancelled) setState({ ...lookup, status: "ready", error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ ...EMPTY_LOOKUP, status: "error", error });
      });
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
  const [state, setState] = useState(() => ({ ...EMPTY_LOOKUP, status: key ? "loading" : "ready", error: null }));

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setState({ ...EMPTY_LOOKUP, status: "ready", error: null });
      return () => {
        cancelled = true;
      };
    }

    setState((current) => ({ ...current, status: responseCache.has(url) ? current.status : "loading", error: null }));
    fetchCatalog(url, orderedIds)
      .then((lookup) => {
        if (!cancelled) setState({ ...lookup, status: "ready", error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ ...EMPTY_LOOKUP, status: "error", error });
      });

    return () => {
      cancelled = true;
    };
  }, [key, orderedIds, url]);

  return state;
}
