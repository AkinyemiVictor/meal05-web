"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import HomeProductCollection from "@/components/home-product-collection";
import { pickMostPopularProducts, resolveStockClass } from "@/lib/catalogue";
import useProducts from "@/lib/use-products";
import { getProductHref } from "@/lib/products";

export default function LandingPopularPreview() {
  const router = useRouter();
  const { ordered: products, status } = useProducts();
  const popular = useMemo(() => {
    const available = (products || []).filter((product) => resolveStockClass(product.stock) !== "is-unavailable");
    const featured = available.filter((product) => product.isPopular || product.isBestseller || product.isHomepagePick || product.isFeatured);
    return (featured.length ? featured : pickMostPopularProducts(available, new Set(), 4)).slice(0, 4);
  }, [products]);
  return <HomeProductCollection eyebrow="Popular right now" title="Fresh picks of the day" products={popular} status={status} emptyMessage="Fresh picks are being restocked." seeAllHref="/section/popular" onAdd={(product)=>router.push(getProductHref(product))} actionLabel="View product" />;
}
