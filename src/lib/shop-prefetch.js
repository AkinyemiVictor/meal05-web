"use client";

import { prefetchCatalogProducts } from "@/lib/use-catalog-products";
import { prefetchCategories } from "@/lib/use-categories";

export const SHOP_ROUTE = "/shop";
export const SHOP_FIRST_PAGE_CATALOG_URL = "/api/catalog/cards?page=1&pageSize=20&sort=default";

export const prefetchShop = (router) => {
  router?.prefetch?.(SHOP_ROUTE);
  return Promise.allSettled([
    prefetchCatalogProducts(SHOP_FIRST_PAGE_CATALOG_URL),
    prefetchCategories(),
  ]);
};
