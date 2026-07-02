"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HomeProductCollection from "@/components/home-product-collection";
import { normaliseProductCatalogue, pickMostPopularProducts, resolveStockClass } from "@/lib/catalogue";
import { getProductHref } from "@/lib/products";

export default function LandingPopularPreview() {
  const router = useRouter();
  const [catalogue, setCatalogue] = useState({});
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/products?view=landing", { cache: "default" })
      .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(payload => { if (!cancelled) { setCatalogue(payload?.grouped || {}); setStatus("ready"); } })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []);
  const products = useMemo(() => normaliseProductCatalogue(catalogue).ordered, [catalogue]);
  const popular = useMemo(() => {
    const available = (products || []).filter((product) => resolveStockClass(product.stock) !== "is-unavailable");
    const featured = available.filter((product) => product.isPopular || product.isBestseller || product.isHomepagePick || product.isFeatured);
    return (featured.length ? featured : pickMostPopularProducts(available, new Set(), 4)).slice(0, 4);
  }, [products]);
  return <HomeProductCollection eyebrow="Popular right now" title="Fresh picks of the day" products={popular} status={status} emptyMessage="Fresh picks are being restocked." seeAllHref="/section/popular" onAdd={(product)=>router.push(getProductHref(product))} actionLabel="View product" />;
}
