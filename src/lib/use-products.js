"use client";

import { useEffect, useMemo, useState } from "react";
import { normaliseProductCatalogue } from "@/lib/catalogue";

export default function useProducts() {
  const [catalogue, setCatalogue] = useState({});
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setStatus("loading");
      try {
        const res = await fetch("/api/products", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const grouped = (json && json.grouped ? json.grouped : json) || {};
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
      load();
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
