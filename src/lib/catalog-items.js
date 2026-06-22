import BUNDLE_PLANS from "@/data/bundle-plans";
import { getBundlePlanPricingState } from "@/lib/bundle-plans";

export const CATALOG_ITEM_TYPES = {
  PRODUCT: "product",
  BUNDLE: "bundle",
};

export const mapProductToCatalogItem = (product) => {
  if (!product) return null;
  return {
    type: CATALOG_ITEM_TYPES.PRODUCT,
    id: `product-${product.id}`,
    product,
    name: product.name || "",
    category: product.category || "",
    categorySlug: product.categorySlug || "",
    price: Number(product.price || 0),
  };
};

export const getBundlePlanPrice = (plan) =>
  Number(plan?.bundlePriceNgn || getBundlePlanPricingState(plan).individualTotalNgn || 0);

export const mapBundlePlanToCatalogItem = (plan) => {
  if (!plan) return null;
  return {
    type: CATALOG_ITEM_TYPES.BUNDLE,
    id: `bundle-${plan.id || plan.slug}`,
    plan,
    name: plan.name || "",
    category: "MealKits",
    categorySlug: "bundle-plans",
    price: getBundlePlanPrice(plan),
  };
};

export const buildCatalogItems = (products = [], bundlePlans = BUNDLE_PLANS) => {
  const productItems = (Array.isArray(products) ? products : [])
    .map(mapProductToCatalogItem)
    .filter(Boolean);
  const bundleItems = (Array.isArray(bundlePlans) ? bundlePlans : [])
    .map(mapBundlePlanToCatalogItem)
    .filter(Boolean);
  return [...productItems, ...bundleItems];
};

export const getCatalogItemName = (item) => item?.name || item?.product?.name || item?.plan?.name || "";

export const getCatalogItemPrice = (item) => {
  if (Number.isFinite(item?.price)) return item.price;
  if (item?.type === CATALOG_ITEM_TYPES.BUNDLE) return getBundlePlanPrice(item.plan);
  return Number(item?.product?.price || 0);
};

export const isBundleCatalogItem = (item) => item?.type === CATALOG_ITEM_TYPES.BUNDLE;
