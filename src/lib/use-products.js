"use client";

import { useEffect, useMemo, useState } from "react";
import { normaliseProductCatalogue } from "@/lib/catalogue";

let productsRequestCache = null;

const fetchProductsCatalogue = async ({ refresh = false } = {}) => {
  if (!refresh && productsRequestCache) return productsRequestCache;
  productsRequestCache = fetch("/api/products")
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => (json && json.grouped ? json.grouped : json) || {})
    .catch((error) => {
      productsRequestCache = null;
      throw error;
    });
  return productsRequestCache;
};

export default function useProducts() {
  const [catalogue, setCatalogue] = useState({});
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async ({ refresh = false } = {}) => {
      setStatus("loading");
      try {
        const grouped = await fetchProductsCatalogue({ refresh });
        if (!cancelled) {
          setCatalogue(grouped);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setCatalogue({});
          setError(err);
          setStatus("error");
        }
      }
    };
    load();
    const handleCheckoutCompleted = () => {
      load({ refresh: true });
    };
    if (typeof window !== "undefined") {
      window.addEventListener("checkout-completed", handleCheckoutCompleted);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("checkout-completed", handleCheckoutCompleted);
      }
    };
  }, []);

  const lookup = useMemo(() => normaliseProductCatalogue(catalogue), [catalogue]);

  return {
    catalogue,
    ordered: lookup.ordered,
    index: lookup.index,
    status,
    error,
  };
}
