export const CATALOG_ITEM_TYPES = {
  PRODUCT: "product",
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

export const buildCatalogItems = (products = []) => {
  const productItems = (Array.isArray(products) ? products : [])
    .map(mapProductToCatalogItem)
    .filter(Boolean);
  return productItems;
};

export const getCatalogItemName = (item) => item?.name || item?.product?.name || "";

export const getCatalogItemPrice = (item) => {
  if (Number.isFinite(item?.price)) return item.price;
  return Number(item?.product?.price || 0);
};

export const isBundleCatalogItem = () => false;
