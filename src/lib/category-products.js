import {
  loadCategoryCounts,
  loadCategoryRows,
  mapCategoryRows,
  toCategorySlug,
} from "@/lib/categories-server";
import { loadPublicCatalogPage } from "@/lib/public-catalog-server";

/**
 * Build a category page from the same compact, market-aware catalogue view used
 * by the shop.  The previous implementation loaded the market, every product,
 * every catalogue row, images, and variants in several sequential requests.
 * These independent reads deliberately start together so Supabase network
 * latency is paid once rather than once per table.
 */
export const loadCategoryProductsPayload = async (supabase, slug) => {
  const requestedSlug = toCategorySlug(slug);
  const [rows, counts, catalogPayload] = await Promise.all([
    loadCategoryRows(supabase),
    loadCategoryCounts(supabase),
    loadPublicCatalogPage({ category: requestedSlug, page: 1, pageSize: 20 }),
  ]);

  const categories = mapCategoryRows(rows, counts);
  const category = categories.find((entry) => entry.slug === requestedSlug) || null;

  if (!category) {
    return {
      category: null,
      products: [],
      categories,
      market: catalogPayload?.market || null,
      pagination: catalogPayload?.pagination || null,
    };
  }

  const products = (Array.isArray(catalogPayload?.flat) ? catalogPayload.flat : [])
    .filter((product) => product?.id && product?.isHidden !== true)
    .map((product) => ({
      ...product,
      category: category.name || category.label,
      categorySlug: category.slug,
    }));

  return {
    category,
    categories,
    market: catalogPayload?.market || null,
    pagination: catalogPayload?.pagination || null,
    products,
  };
};

export const mapCategorySlug = toCategorySlug;
export const buildCategoryProducts = loadCategoryProductsPayload;
export const findCategoryBySlug = async (supabase, slug) => {
  const payload = await loadCategoryProductsPayload(supabase, slug);
  return payload.category;
};

const categoryProductsApi = {
  mapCategorySlug,
  buildCategoryProducts,
  findCategoryBySlug,
  loadCategoryProductsPayload,
};

export default categoryProductsApi;
