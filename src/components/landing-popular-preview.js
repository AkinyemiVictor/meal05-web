"use client";
import { useMemo } from "react";
import HomeProductCollection from "@/components/home-product-collection";
import { pickMostPopularProducts, resolveStockClass } from "@/lib/catalogue";
import useProducts from "@/lib/use-products";

export default function LandingPopularPreview() {
  const { ordered: products, status } = useProducts();
  const popular = useMemo(() => {
    const available = (products || []).filter((product) => resolveStockClass(product.stock) !== "is-unavailable");
    const featured = available.filter((product) => product.isPopular || product.isBestseller || product.isHomepagePick || product.isFeatured);
    return (featured.length ? featured : pickMostPopularProducts(available, new Set(), 4)).slice(0, 4);
  }, [products]);
  return <HomeProductCollection eyebrow="Popular right now" title="Fresh picks of the day" products={popular} status={status} emptyMessage="Fresh picks are being restocked." seeAllHref="/section/popular" />;
}
