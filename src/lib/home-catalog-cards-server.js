import { toCategorySlug } from "@/lib/categories-server";
import { getCatalogPageRange, normalizeCatalogPagination } from "@/lib/catalog-pagination";
import { publicMarket } from "@/lib/market-catalog-server";
import { getDefaultMarket } from "@/lib/market-server";
import { pickFirstNumber } from "@/lib/number";
import { buildPackagingMetadata } from "@/lib/packaging-fees";
import { resolveProductImage } from "@/lib/product-image";
import { normalizePromoEnabled, normalizePromoText, parsePromoExpiry } from "@/lib/product-promo";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

const HOME_CARD_FIELDS = [
  "product_id",
  "name",
  "category_name",
  "category_slug",
  "main_image_url",
  "thumb_image_url",
  "card_image_url",
  "detail_image_url",
  "in_season",
  "promo_tag_enabled",
  "promo_tag_text",
  "promo_tag_expires_at",
  "promo_tag_visible",
  "default_variant_id",
  "default_variant_name",
  "unit",
  "base_unit",
  "base_quantity",
  "purchase_mode",
  "min_quantity",
  "max_quantity",
  "step_quantity",
  "starting_price",
  "old_price",
  "stock_count",
  "in_stock",
  "market_id",
  "currency_code",
  "currency_symbol",
  "locale",
  "created_at",
  "search_text",
  "active_variant_count",
].join(", ");

const CATALOG_PAGE_SORTS = {
  default: [{ column: "product_id", ascending: true }],
  "price-asc": [
    { column: "starting_price", ascending: true },
    { column: "product_id", ascending: true },
  ],
  "price-desc": [
    { column: "starting_price", ascending: false },
    { column: "product_id", ascending: true },
  ],
  "name-asc": [
    { column: "name", ascending: true },
    { column: "product_id", ascending: true },
  ],
};

const numberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const uniqueIds = (ids = [], limit = 120) => {
  const seen = new Set();
  const output = [];
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    if (output.length >= limit) break;
  }
  return output;
};

const groupProducts = (products = []) =>
  products.reduce((groups, product) => {
    const key = product.categorySlug || "uncategorised";
    if (!groups[key]) groups[key] = [];
    groups[key].push(product);
    return groups;
  }, {});

const buildHomeCardProduct = (row = {}) => {
  const price = pickFirstNumber(row, ["starting_price", "price"], 0) || 0;
  const oldPriceRaw = pickFirstNumber(row, ["old_price", "oldPrice"], price);
  const oldPrice = Number.isFinite(oldPriceRaw) && oldPriceRaw > 0 ? Math.max(price, oldPriceRaw) : price;
  const discount = oldPrice > price && price > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  const categorySlug = toCategorySlug(row?.category_slug || row?.category_name || "");
  const image = resolveProductImage(row?.card_image_url, row?.main_image_url, row?.image, row?.image_url);

  return {
    id: String(row?.product_id || ""),
    variantId: row?.default_variant_id ? String(row.default_variant_id) : String(row?.product_id || ""),
    variantName: String(row?.default_variant_name || ""),
    name: String(row?.name || "Fresh produce"),
    image,
    mainImageUrl: image,
    thumbImageUrl: resolveProductImage(row?.thumb_image_url, image),
    cardImageUrl: resolveProductImage(row?.card_image_url, image),
    detailImageUrl: resolveProductImage(row?.detail_image_url, image),
    price,
    oldPrice,
    unit: String(row?.unit || ""),
    stock: row?.stock_count ?? (row?.in_stock ? "In stock" : 0),
    inSeason: row?.in_season !== false,
    discount,
    variantCount: Number(row?.active_variant_count || 0) || 0,
    hasMultipleOptions: Number(row?.active_variant_count || 0) > 1,
    category: String(row?.category_name || ""),
    categorySlug,
    promoTagEnabled: normalizePromoEnabled(row?.promo_tag_visible ?? row?.promo_tag_enabled),
    promoTagText: normalizePromoText(row?.promo_tag_text),
    promoTagExpiresAt: parsePromoExpiry(row?.promo_tag_expires_at),
    marketId: row?.market_id || "",
    currencyCode: row?.currency_code || "",
    currencySymbol: row?.currency_symbol || "",
    locale: row?.locale || "",
    purchaseMode: row?.purchase_mode || undefined,
    purchase_mode: row?.purchase_mode || undefined,
    minQuantity: numberOrNull(row?.min_quantity),
    min_quantity: numberOrNull(row?.min_quantity),
    maxQuantity: numberOrNull(row?.max_quantity),
    max_quantity: numberOrNull(row?.max_quantity),
    stepQuantity: numberOrNull(row?.step_quantity),
    step_quantity: numberOrNull(row?.step_quantity),
    baseUnit: row?.base_unit || undefined,
    base_unit: row?.base_unit || undefined,
    baseQuantity: numberOrNull(row?.base_quantity),
    base_quantity: numberOrNull(row?.base_quantity),
    variations: [],
    optionsLoaded: false,
    tags: [],
    packaging: "",
    ...buildPackagingMetadata({
      ...row,
      name: row?.name,
      category: row?.category_name,
      categorySlug,
      packaging: "",
    }),
  };
};

export async function loadHomeCatalogCards({ ids, limit = 36, inSeasonOnly = false } = {}) {
  const admin = getSupabaseAdminClient();
  const market = await getDefaultMarket();
  const requestedIds = uniqueIds(ids);
  const maxRows = Math.min(Math.max(Number(limit) || 36, 1), 120);

  let query = admin
    .from("product_card_catalog")
    .select(HOME_CARD_FIELDS, { head: false })
    .eq("market_id", market.id);

  if (requestedIds.length) query = query.in("product_id", requestedIds);
  if (inSeasonOnly) query = query.eq("in_season", true);
  query = query
    .order("in_stock", { ascending: false })
    .order("product_id", { ascending: true });

  const { data, error } = await query.limit(requestedIds.length ? requestedIds.length : maxRows);
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const sortedRows = requestedIds.length
    ? [...rows].sort((a, b) => {
        const availabilityDifference = Number(b?.in_stock === true) - Number(a?.in_stock === true);
        if (availabilityDifference !== 0) return availabilityDifference;
        return requestedIds.indexOf(String(a.product_id)) - requestedIds.indexOf(String(b.product_id));
      })
    : rows;
  const flat = sortedRows
    .map(buildHomeCardProduct)
    .filter((product) => product.id);

  return {
    grouped: groupProducts(flat),
    flat,
    market: publicMarket(market),
  };
}

export async function loadCatalogCardPage({
  page = 1,
  pageSize = 20,
  category = "",
  search = "",
  sort = "default",
} = {}) {
  const admin = getSupabaseAdminClient();
  const market = await getDefaultMarket();
  const range = getCatalogPageRange({ page, pageSize });
  const categorySlug = toCategorySlug(category || "");
  const searchTerm = String(search || "")
    .trim()
    .replace(/[%_,().]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  const selectedSort = CATALOG_PAGE_SORTS[sort] || CATALOG_PAGE_SORTS.default;

  let query = admin
    .from("product_card_catalog")
    .select(HOME_CARD_FIELDS, { head: false })
    .eq("market_id", market.id);
  let countQuery = admin
    .from("product_card_catalog")
    .select("product_id", { count: "exact", head: true })
    .eq("market_id", market.id);

  if (categorySlug) {
    query = query.eq("category_slug", categorySlug);
    countQuery = countQuery.eq("category_slug", categorySlug);
  }
  if (searchTerm) {
    query = query.ilike("search_text", `%${searchTerm}%`);
    countQuery = countQuery.ilike("search_text", `%${searchTerm}%`);
  }
  query = query.order("in_stock", { ascending: false });
  selectedSort.forEach(({ column, ascending }) => {
    query = query.order(column, { ascending });
  });

  const [pageResult, countResult] = await Promise.all([
    query.range(range.from, range.to),
    countQuery,
  ]);
  if (pageResult.error) throw pageResult.error;
  if (countResult.error) throw countResult.error;

  const flat = (Array.isArray(pageResult.data) ? pageResult.data : [])
    .map(buildHomeCardProduct)
    .filter((product) => product.id);
  const pagination = normalizeCatalogPagination({
    page: range.page,
    pageSize: range.pageSize,
    total: countResult.count,
  });

  return {
    grouped: groupProducts(flat),
    flat,
    market: publicMarket(market),
    pagination,
  };
}
