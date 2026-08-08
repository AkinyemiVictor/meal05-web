export const DEFAULT_CATALOG_PAGE_SIZE = 20;
export const MAX_CATALOG_PAGE_SIZE = 60;

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const normalizeCatalogPagination = ({ page = 1, pageSize = DEFAULT_CATALOG_PAGE_SIZE, total = 0 } = {}) => {
  const safePage = positiveInteger(page, 1);
  const safePageSize = Math.min(positiveInteger(pageSize, DEFAULT_CATALOG_PAGE_SIZE), MAX_CATALOG_PAGE_SIZE);
  const safeTotal = Math.max(0, Number.parseInt(String(total ?? 0), 10) || 0);
  return {
    page: safePage,
    pageSize: safePageSize,
    total: safeTotal,
    totalPages: Math.max(1, Math.ceil(safeTotal / safePageSize)),
  };
};

export const getCatalogPageRange = ({ page = 1, pageSize = DEFAULT_CATALOG_PAGE_SIZE } = {}) => {
  const pagination = normalizeCatalogPagination({ page, pageSize });
  const from = (pagination.page - 1) * pagination.pageSize;
  return {
    ...pagination,
    from,
    to: from + pagination.pageSize - 1,
  };
};

const categorySlug = (value) =>
  String(value || "uncategorised")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "uncategorised";

export const countDistinctCatalogProductsByCategory = (rows) => {
  const buckets = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const productId = String(row?.product_id ?? row?.productId ?? "").trim();
    if (!productId) return;
    const slug = categorySlug(row?.category_slug || row?.categorySlug);
    if (!buckets.has(slug)) buckets.set(slug, { products: new Set(), available: new Set() });
    const bucket = buckets.get(slug);
    bucket.products.add(productId);
    if (row?.in_stock === true || row?.inStock === true) bucket.available.add(productId);
  });

  return Object.fromEntries(
    [...buckets.entries()].map(([slug, bucket]) => [
      slug,
      {
        product_count: bucket.products.size,
        available_product_count: bucket.available.size,
      },
    ])
  );
};
