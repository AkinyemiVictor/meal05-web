import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { toCategorySlug } from "@/lib/categories-server";
import { pickFirstNumber } from "@/lib/number";
import { resolveProductImage } from "@/lib/product-image";
import { normalizeProductMerchandisingRecord } from "@/lib/product-merchandising";
import { normalizePromoEnabled, normalizePromoText, parsePromoExpiry } from "@/lib/product-promo";
import { selectProductCardVariant } from "@/lib/product-card-pricing";
import { buildPackagingMetadata } from "@/lib/packaging-fees";
import { applyMarketListing, loadMarketCatalog, publicMarket } from "@/lib/market-catalog-server";
import { getDefaultMarket } from "@/lib/market-server";
import { getCatalogPageRange, normalizeCatalogPagination } from "@/lib/catalog-pagination";
import { applyCatalogSearchTerms, getCatalogSearchTerms } from "@/lib/catalog-search";
import { getVariantPurchaseRules } from "@/lib/purchase-quantities";
import { getAvailableCount, resolveStockValueFromRow } from "@/lib/stock";
import { sortVariantsBySize } from "@/lib/variant-order";

export const PUBLIC_CATALOG_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  "CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
  "Vercel-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

const PRODUCT_FIELDS = [
  "id",
  "name",
  "main_image_url",
  "category_id",
  "is_active",
  "in_season",
  "unit",
  "price",
  "old_price",
  "promo_tag_enabled",
  "promo_tag_text",
  "promo_tag_expires_at",
  "is_featured",
  "is_hidden",
  "is_bestseller",
  "is_new_arrival",
  "is_homepage_pick",
  "is_popular",
  "is_chef_choice",
  "is_under_15m",
  "is_bundle_eligible",
  "collection_slug",
  "prep_minutes",
  "created_at",
].join(", ");

const CATEGORY_FIELDS = [
  "id",
  "name",
  "slug",
].join(", ");

const CARD_CATALOG_FIELDS = [
  "product_id",
  "name",
  "description",
  "sku",
  "category_id",
  "category_name",
  "category_slug",
  "main_image_url",
  "thumb_image_url",
  "card_image_url",
  "detail_image_url",
  "original_image_url",
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
  "timezone",
  "created_at",
  "search_text",
  "active_variant_count",
].join(", ");

const CARD_CATALOG_WITH_OPTIONS_FIELDS = `${CARD_CATALOG_FIELDS}, variations`;

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

const buildCategoryIndex = (rows) =>
  (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    const id = String(row?.id ?? "").trim();
    if (id) acc.set(id, row);
    return acc;
  }, new Map());

const buildProductSortScore = (row) => {
  const score =
    (row?.is_homepage_pick ? 100 : 0) +
    (row?.is_featured ? 50 : 0) +
    (row?.is_bestseller ? 25 : 0) +
    (row?.is_popular ? 10 : 0);
  const createdAt = Date.parse(row?.created_at || "") || 0;
  return { score, createdAt };
};

const sortProductsForView = (rows, view) => {
  if (view === "new") {
    return [...rows].sort((a, b) => (Date.parse(b?.created_at || "") || 0) - (Date.parse(a?.created_at || "") || 0));
  }
  return [...rows].sort((a, b) => {
    const aScore = buildProductSortScore(a);
    const bScore = buildProductSortScore(b);
    if (bScore.score !== aScore.score) return bScore.score - aScore.score;
    return bScore.createdAt - aScore.createdAt;
  });
};

const buildPublicCatalogProduct = (row, categoryIndex) => {
  const categoryRow = categoryIndex.get(String(row?.category_id ?? "")) || null;
  const categoryName = String(
    categoryRow?.name ||
      categoryRow?.label ||
      categoryRow?.title ||
      categoryRow?.category_name ||
      row?.category_name ||
      ""
  ).trim();
  const categorySlug = toCategorySlug(
    categoryRow?.slug || categoryRow?.category_slug || categoryName || row?.category_slug || ""
  );
  const price = pickFirstNumber(row, ["starting_price", "price", "unit_price", "sale_price"], 0) || 0;
  const oldPriceRaw = pickFirstNumber(row, ["old_price", "oldPrice", "compare_at_price"], price);
  const oldPrice = Number.isFinite(oldPriceRaw) && oldPriceRaw > 0 ? Math.max(price, oldPriceRaw) : price;
  const discount = oldPrice > price && price > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  const merchandising = normalizeProductMerchandisingRecord(row);
  const image = resolveProductImage(row?.card_image_url, row?.main_image_url, row?.image, row?.image_url);

  return {
    id: String(row?.id ?? ""),
    name: String(row?.name || "Fresh produce"),
    image,
    mainImageUrl: image,
    thumbImageUrl: resolveProductImage(row?.thumb_image_url, image),
    cardImageUrl: resolveProductImage(row?.card_image_url, image),
    detailImageUrl: resolveProductImage(row?.detail_image_url, image),
    price,
    oldPrice,
    unit: String(row?.unit || ""),
    stock: row?.in_stock ?? row?.stock ?? "",
    inSeason: row?.in_season !== false,
    discount,
    category: categoryName || String(row?.category_name || ""),
    categorySlug,
    variantName: "",
    promoTagEnabled: normalizePromoEnabled(row?.promo_tag_enabled ?? row?.promoTagEnabled),
    promoTagText: normalizePromoText(row?.promo_tag_text ?? row?.promoTagText),
    promoTagExpiresAt: parsePromoExpiry(row?.promo_tag_expires_at ?? row?.promoTagExpiresAt),
    collectionSlug: String(row?.collection_slug || ""),
    prepMinutes: Number(row?.prep_minutes || 0) || undefined,
    isPopular: Boolean(row?.is_popular || row?.isPopular || row?.is_bestseller || row?.isBestseller),
    isChefChoice: Boolean(row?.is_chef_choice || row?.isChefChoice),
    isUnder15m: Boolean(row?.is_under_15m || row?.isUnder15m || row?.is_under_15_min || row?.isUnder15Minutes),
    isBundleEligible: Boolean(row?.is_bundle_eligible || row?.isBundleEligible),
    tags: [],
    packaging: "",
    ...buildPackagingMetadata({
      ...row,
      name: row?.name,
      category: categoryName,
      categorySlug,
    }),
    ...merchandising,
  };
};

const numberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const textOrNull = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const pickFirstText = (row, fields = []) => {
  for (const field of fields) {
    const value = String(row?.[field] ?? "").trim();
    if (value) return value;
  }
  return "";
};

const formatRangeValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return String(Math.round(numeric * 100) / 100);
};

const buildRangeLabel = (row) => {
  const volumeMin = numberOrNull(row?.volume_min ?? row?.volumeMin);
  const volumeMax = numberOrNull(row?.volume_max ?? row?.volumeMax);
  if (volumeMin != null && volumeMax != null) {
    const unit = pickFirstText(row, ["volume_unit", "volumeUnit"]);
    const value = volumeMin === volumeMax
      ? formatRangeValue(volumeMin)
      : `${formatRangeValue(volumeMin)}-${formatRangeValue(volumeMax)}`;
    return `${value}${unit}`;
  }

  const weightMin = numberOrNull(
    row?.weight_min ?? row?.weightMin ?? row?.min_weight ?? row?.minWeight
  );
  const weightMax = numberOrNull(
    row?.weight_max ?? row?.weightMax ?? row?.max_weight ?? row?.maxWeight
  );
  if (weightMin == null || weightMax == null) return "";
  const unit = pickFirstText(row, ["weight_unit", "weightUnit", "base_unit", "baseUnit"]);
  return `${formatRangeValue(weightMin)}-${formatRangeValue(weightMax)}${unit}`;
};

const isPublicVariantSelectable = (row) => {
  if (!row || row.is_active === false || row.isActive === false) return false;
  return getAvailableCount(resolveStockValueFromRow(row)) !== 0;
};

const buildPublicProductVariant = (row, product, market = {}) => {
  const purchaseRules = getVariantPurchaseRules(row);
  const rangeLabel = buildRangeLabel(row);
  // Curated option labels describe fixed packs more accurately than measurement
  // metadata. Keep ranges as a fallback for legacy rows without a label.
  const optionLabel =
    pickFirstText(row, ["display_label", "displayLabel", "size_label", "sizeLabel", "name", "size", "ripeness", "label"]) ||
    rangeLabel;
  const sizeLabel =
    pickFirstText(row, ["display_label", "displayLabel", "size_label", "sizeLabel", "size", "name"]) ||
    rangeLabel;
  const price = pickFirstNumber(row, [
    "price",
    "unit_price",
    "unitPrice",
    "sale_price",
    "salePrice",
    "selling_price",
    "sellingPrice",
  ]);
  const oldPrice = pickFirstNumber(row, [
    "old_price",
    "oldPrice",
    "compare_at_price",
    "compareAtPrice",
    "list_price",
    "listPrice",
  ]);
  const baseUnit = textOrNull(row?.base_unit ?? row?.baseUnit);
  const baseQuantity = numberOrNull(row?.base_quantity ?? row?.baseQuantity);
  const weightMin = numberOrNull(row?.weight_min ?? row?.weightMin);
  const weightMax = numberOrNull(row?.weight_max ?? row?.weightMax);
  const weightUnit = textOrNull(row?.weight_unit ?? row?.weightUnit);
  const volumeMin = numberOrNull(row?.volume_min ?? row?.volumeMin);
  const volumeMax = numberOrNull(row?.volume_max ?? row?.volumeMax);
  const volumeUnit = textOrNull(row?.volume_unit ?? row?.volumeUnit);
  const optionRole = textOrNull(row?.option_role ?? row?.optionRole);
  const stock = resolveStockValueFromRow(row);

  return {
    variationId: String(row?.id ?? ""),
    name: optionLabel || "Option",
    ripeness: textOrNull(row?.ripeness) || undefined,
    size: textOrNull(row?.size ?? row?.size_label) || undefined,
    sizeLabel: sizeLabel || undefined,
    packaging: textOrNull(row?.packaging) || undefined,
    price: price != null ? price : undefined,
    oldPrice: oldPrice != null ? oldPrice : undefined,
    unit: pickFirstText(row, ["unit", "unit_label", "unitLabel", "unit_name", "unitName"]) || product?.unit || undefined,
    currencyCode: row?.currency_code || market?.currencyCode || product?.currencyCode || "",
    purchaseMode: purchaseRules.purchaseMode,
    purchase_mode: purchaseRules.purchaseMode,
    minQuantity: purchaseRules.minQuantity,
    min_quantity: purchaseRules.minQuantity,
    maxQuantity: purchaseRules.maxQuantity,
    max_quantity: purchaseRules.maxQuantity,
    stepQuantity: purchaseRules.stepQuantity,
    step_quantity: purchaseRules.stepQuantity,
    baseUnit,
    base_unit: baseUnit,
    baseQuantity,
    base_quantity: baseQuantity,
    weightMin,
    weight_min: weightMin,
    weightMax,
    weight_max: weightMax,
    weightUnit,
    weight_unit: weightUnit,
    volumeMin,
    volume_min: volumeMin,
    volumeMax,
    volume_max: volumeMax,
    volumeUnit,
    volume_unit: volumeUnit,
    optionRole,
    option_role: optionRole,
    stock,
    stockCount: row?.stock_count ?? undefined,
    inSeason: row?.in_season ?? undefined,
    image: resolveProductImage(row?.variant_image_url, row?.image_url, row?.image, product?.image),
    category: pickFirstText(row, ["category", "category_name", "categoryName"]) || product?.category || undefined,
    categorySlug: product?.categorySlug || undefined,
    is_default: row?.is_default === true,
    isSelectable: isPublicVariantSelectable({ ...row, stock }),
    ...buildPackagingMetadata({
      ...row,
      name: product?.name,
      category: product?.category || "",
      categorySlug: product?.categorySlug || "",
    }),
  };
};

const attachPublicProductVariations = async (admin, products, market = {}) => {
  const list = Array.isArray(products) ? products : [];
  const productIds = uniqueIds(list.map((product) => product?.id), 120);
  if (!productIds.length || !market?.id) return list;

  const { data, error } = await admin
    .from("product_variants")
    .select("id, product_id, name, unit, price, old_price, stock_count, size, size_label, display_label, ripeness, base_unit, base_quantity, is_default, is_active, weight_min, weight_max, weight_unit, volume_min, volume_max, volume_unit, market_id, currency_code, purchase_mode, min_quantity, max_quantity, step_quantity, option_role", { head: false })
    .in("product_id", productIds)
    .eq("market_id", market.id)
    .eq("is_active", true)
    .gt("price", 0)
    .order("id", { ascending: true });
  if (error) throw error;

  const productIndex = new Map(list.map((product) => [String(product.id), product]));
  const grouped = new Map();
  (Array.isArray(data) ? data : []).forEach((row) => {
    const productId = String(row?.product_id || "");
    const product = productIndex.get(productId);
    if (!product) return;
    if (!grouped.has(productId)) grouped.set(productId, []);
    grouped.get(productId).push(buildPublicProductVariant(row, product, market));
  });

  return list.map((product) => {
    const variations = sortVariantsBySize(grouped.get(String(product.id)) || []);
    return {
      ...product,
      variations,
      optionsLoaded: true,
      variantCount: Math.max(Number(product?.variantCount || 0) || 0, variations.length),
      hasMultipleOptions: product?.hasMultipleOptions === true || variations.length > 1,
    };
  });
};

const attachEmbeddedProductVariations = (rows, products, market = {}) => {
  const rowIndex = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [String(row?.product_id || ""), row])
  );

  return (Array.isArray(products) ? products : []).map((product) => {
    const rawVariations = rowIndex.get(String(product?.id || ""))?.variations;
    const variations = sortVariantsBySize(
      (Array.isArray(rawVariations) ? rawVariations : [])
        .map((row) => buildPublicProductVariant(row, product, market))
    );
    return {
      ...product,
      variations,
      optionsLoaded: true,
      variantCount: Math.max(Number(product?.variantCount || 0) || 0, variations.length),
      hasMultipleOptions: product?.hasMultipleOptions === true || variations.length > 1,
    };
  });
};

const buildPublicCatalogProductFromCard = (row) => {
  const price = pickFirstNumber(row, ["starting_price", "price"], 0) || 0;
  const oldPriceRaw = pickFirstNumber(row, ["old_price", "oldPrice"], price);
  const oldPrice = Number.isFinite(oldPriceRaw) && oldPriceRaw > 0 ? Math.max(price, oldPriceRaw) : price;
  const discount = oldPrice > price && price > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  const categorySlug = toCategorySlug(row?.category_slug || row?.category_name || "");
  const image = resolveProductImage(row?.card_image_url, row?.main_image_url, row?.image, row?.image_url);
  const embeddedVariations = Array.isArray(row?.variations) ? row.variations : [];
  const defaultEmbeddedVariant = embeddedVariations.find(
    (variant) => String(variant?.id || "") === String(row?.default_variant_id || "")
  );
  const availabilityMode = String(
    defaultEmbeddedVariant?.availability_mode ??
      (embeddedVariations.length && embeddedVariations.every((variant) => variant?.availability_mode === "unavailable")
        ? "unavailable"
        : "standard")
  );

  return {
    id: String(row?.product_id ?? row?.id ?? ""),
    variantId: row?.default_variant_id ? String(row.default_variant_id) : String(row?.product_id ?? row?.id ?? ""),
    variantName: String(row?.default_variant_name || ""),
    name: String(row?.name || "Fresh produce"),
    image,
    mainImageUrl: image,
    thumbImageUrl: resolveProductImage(row?.thumb_image_url, image),
    cardImageUrl: resolveProductImage(row?.card_image_url, image),
    detailImageUrl: resolveProductImage(row?.detail_image_url, image),
    price,
    oldPrice,
    availabilityMode,
    availability_mode: availabilityMode,
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
    minQuantity: numberOrNull(row?.min_quantity),
    maxQuantity: numberOrNull(row?.max_quantity),
    stepQuantity: numberOrNull(row?.step_quantity),
    baseUnit: textOrNull(row?.base_unit),
    baseQuantity: numberOrNull(row?.base_quantity),
    weightMin: numberOrNull(row?.weight_min),
    weightMax: numberOrNull(row?.weight_max),
    weightUnit: textOrNull(row?.weight_unit),
    volumeMin: numberOrNull(row?.volume_min),
    volumeMax: numberOrNull(row?.volume_max),
    volumeUnit: textOrNull(row?.volume_unit),
    optionRole: textOrNull(row?.option_role),
    purchase_mode: row?.purchase_mode || undefined,
    min_quantity: numberOrNull(row?.min_quantity),
    max_quantity: numberOrNull(row?.max_quantity),
    step_quantity: numberOrNull(row?.step_quantity),
    base_unit: textOrNull(row?.base_unit),
    base_quantity: numberOrNull(row?.base_quantity),
    weight_min: numberOrNull(row?.weight_min),
    weight_max: numberOrNull(row?.weight_max),
    weight_unit: textOrNull(row?.weight_unit),
    volume_min: numberOrNull(row?.volume_min),
    volume_max: numberOrNull(row?.volume_max),
    volume_unit: textOrNull(row?.volume_unit),
    option_role: textOrNull(row?.option_role),
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

const isVisibleCatalogProduct = (product) =>
  Boolean(product?.id) &&
  (Number(product?.price) > 0 || String(product?.availabilityMode ?? product?.availability_mode) === "unavailable");

const groupProducts = (products) =>
  products.reduce((acc, product) => {
    const key = product.categorySlug || "uncategorised";
    if (!acc[key]) acc[key] = [];
    acc[key].push(product);
    return acc;
  }, {});

const uniqueIds = (ids = [], limit = 80) => {
  const seen = new Set();
  const out = [];
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
};

const overlayVariantMetadata = (product, selection = null) => {
  if (!selection?.variant) return null;
  const { variant, price, oldPrice, discount, variantCount, hasMultipleOptions } = selection;
  return {
    ...product,
    variantId: variant?.id ? String(variant.id) : product.variantId,
    variantName: String(variant?.name || product.variantName || ""),
    price,
    oldPrice,
    discount,
    variantCount,
    hasMultipleOptions,
    unit: String(variant?.unit || product.unit || ""),
    stock: variant?.stock_count ?? product.stock,
    currencyCode: variant?.currency_code || product.currencyCode || "",
    purchaseMode: variant?.purchase_mode || product.purchaseMode,
    minQuantity: numberOrNull(variant?.min_quantity),
    maxQuantity: numberOrNull(variant?.max_quantity),
    stepQuantity: numberOrNull(variant?.step_quantity),
    baseUnit: textOrNull(variant?.base_unit),
    baseQuantity: numberOrNull(variant?.base_quantity),
    weightMin: numberOrNull(variant?.weight_min),
    weightMax: numberOrNull(variant?.weight_max),
    weightUnit: textOrNull(variant?.weight_unit),
    volumeMin: numberOrNull(variant?.volume_min),
    volumeMax: numberOrNull(variant?.volume_max),
    volumeUnit: textOrNull(variant?.volume_unit),
    optionRole: textOrNull(variant?.option_role),
    purchase_mode: variant?.purchase_mode || product.purchase_mode,
    min_quantity: numberOrNull(variant?.min_quantity),
    max_quantity: numberOrNull(variant?.max_quantity),
    step_quantity: numberOrNull(variant?.step_quantity),
    base_unit: textOrNull(variant?.base_unit),
    base_quantity: numberOrNull(variant?.base_quantity),
    weight_min: numberOrNull(variant?.weight_min),
    weight_max: numberOrNull(variant?.weight_max),
    weight_unit: textOrNull(variant?.weight_unit),
    volume_min: numberOrNull(variant?.volume_min),
    volume_max: numberOrNull(variant?.volume_max),
    volume_unit: textOrNull(variant?.volume_unit),
    option_role: textOrNull(variant?.option_role),
  };
};

const loadPublicCatalogProductsFromCardView = async ({
  admin,
  ids,
  category,
  search,
  view,
  limit,
}) => {
  const market = await getDefaultMarket();
  const requestedIds = uniqueIds(ids, 80);
  const maxRows = Math.min(Math.max(Number(limit) || 48, 1), 120);
  const requestedCategorySlug = toCategorySlug(category || "");
  const searchTerms = getCatalogSearchTerms(search);

  let query = admin
    .from("product_card_catalog_with_options")
    .select(CARD_CATALOG_WITH_OPTIONS_FIELDS, { head: false })
    .eq("market_id", market.id);

  if (requestedIds.length) query = query.in("product_id", requestedIds);
  if (requestedCategorySlug) query = query.eq("category_slug", requestedCategorySlug);
  if (view === "in-season") query = query.eq("in_season", true);
  if (searchTerms.length) query = applyCatalogSearchTerms(query, search);

  query = view === "new"
    ? query.order("created_at", { ascending: false })
    : query.order("product_id", { ascending: true });

  const { data, error } = await query.limit(requestedIds.length ? requestedIds.length : maxRows);
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const sortedRows = requestedIds.length
    ? [...rows].sort((a, b) => requestedIds.indexOf(String(a.product_id)) - requestedIds.indexOf(String(b.product_id)))
    : rows;
  const flat = sortedRows
    .map(buildPublicCatalogProductFromCard)
    .filter(isVisibleCatalogProduct);
  const hydratedFlat = attachEmbeddedProductVariations(sortedRows, flat, market);

  return {
    grouped: groupProducts(hydratedFlat),
    flat: hydratedFlat,
    market: publicMarket(market),
  };
};

export async function loadPublicCatalogPage({
  page = 1,
  pageSize = 20,
  category = "",
  search = "",
  sort = "default",
} = {}) {
  const admin = getSupabaseAdminClient();
  const market = await getDefaultMarket();
  const range = getCatalogPageRange({ page, pageSize });
  const requestedCategorySlug = toCategorySlug(category || "");
  const searchTerms = getCatalogSearchTerms(search);
  const selectedSort = CATALOG_PAGE_SORTS[sort] || CATALOG_PAGE_SORTS.default;

  let query = admin
    .from("product_card_catalog_with_options")
    .select(CARD_CATALOG_WITH_OPTIONS_FIELDS, { head: false })
    .eq("market_id", market.id);
  let countQuery = admin
    .from("product_card_catalog")
    .select("product_id", { count: "exact", head: true })
    .eq("market_id", market.id);

  if (requestedCategorySlug) {
    query = query.eq("category_slug", requestedCategorySlug);
    countQuery = countQuery.eq("category_slug", requestedCategorySlug);
  }
  if (searchTerms.length) {
    query = applyCatalogSearchTerms(query, search);
    countQuery = applyCatalogSearchTerms(countQuery, search);
  }
  selectedSort.forEach(({ column, ascending }) => {
    query = query.order(column, { ascending });
  });

  const [pageResult, countResult] = await Promise.all([
    query.range(range.from, range.to),
    countQuery,
  ]);
  const { data, error } = pageResult;
  const { count, error: countError } = countResult;
  if (error) throw error;
  if (countError) throw countError;

  const flat = (Array.isArray(data) ? data : [])
    .map(buildPublicCatalogProductFromCard)
    .filter(isVisibleCatalogProduct);
  const hydratedFlat = attachEmbeddedProductVariations(data, flat, market);
  const pagination = normalizeCatalogPagination({ page: range.page, pageSize: range.pageSize, total: count });

  return {
    grouped: groupProducts(hydratedFlat),
    flat: hydratedFlat,
    market: publicMarket(market),
    pagination,
  };
}

export async function loadPublicCatalogProducts({
  ids,
  category,
  search,
  view = "default",
  limit = 48,
} = {}) {
  const admin = getSupabaseAdminClient();
  try {
    return await loadPublicCatalogProductsFromCardView({
      admin,
      ids,
      category,
      search,
      view,
      limit,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("product_card_catalog unavailable; falling back to legacy product catalogue query", error?.message || error);
    }
  }

  const catalog = await loadMarketCatalog(admin);
  const requestedIds = uniqueIds(ids, 80);
  const maxRows = Math.min(Math.max(Number(limit) || 48, 1), 120);

  if (!catalog.productIds.length) {
    return { grouped: {}, flat: [], market: publicMarket(catalog.market) };
  }

  const categoryRes = await admin.from("product_categories").select(CATEGORY_FIELDS);
  if (categoryRes.error) throw categoryRes.error;
  const categoryIndex = buildCategoryIndex(categoryRes.data);
  const requestedCategorySlug = toCategorySlug(category || "");
  const searchTerms = getCatalogSearchTerms(search);
  const searchTerm = searchTerms.join(" ");
  const searchCategorySlug = searchTerm ? toCategorySlug(searchTerm) : "";
  const categoryIds = requestedCategorySlug
    ? (Array.isArray(categoryRes.data) ? categoryRes.data : [])
        .filter((row) => {
          const slug = toCategorySlug(row?.slug || row?.category_slug || row?.name || row?.label || row?.title || "");
          return slug === requestedCategorySlug;
        })
        .map((row) => row.id)
        .filter(Boolean)
    : searchCategorySlug
      ? (Array.isArray(categoryRes.data) ? categoryRes.data : [])
          .filter((row) => {
            const values = [row?.slug, row?.category_slug, row?.name, row?.label, row?.title]
              .map((value) => toCategorySlug(value || ""))
              .filter(Boolean);
            return values.some((value) => value.includes(searchCategorySlug) || searchCategorySlug.includes(value));
          })
          .map((row) => row.id)
          .filter(Boolean)
    : [];

  let productIds = requestedIds.length
    ? requestedIds.filter((id) => catalog.listings.has(String(id)))
    : catalog.productIds;

  if (!productIds.length) {
    return { grouped: {}, flat: [], market: publicMarket(catalog.market) };
  }

  let query = admin
    .from("products")
    .select(PRODUCT_FIELDS, { head: false })
    .in("id", productIds)
    .eq("is_active", true);

  if (categoryIds.length) query = query.in("category_id", categoryIds);
  if (view === "in-season") query = query.eq("in_season", true);
  if (searchTerms.length && !categoryIds.length) {
    query = applyCatalogSearchTerms(query, search, "name");
  }

  const productRes = await query.limit(requestedIds.length ? productIds.length : Math.min(maxRows * 3, 360));
  if (productRes.error) throw productRes.error;

  const listedRows = (Array.isArray(productRes.data) ? productRes.data : [])
    .map((row) => applyMarketListing(row, catalog))
    .filter(Boolean)
    .filter((row) => normalizeProductMerchandisingRecord(row).isHidden !== true);

  const sortedRows = requestedIds.length
    ? [...listedRows].sort((a, b) => requestedIds.indexOf(String(a.id)) - requestedIds.indexOf(String(b.id)))
    : sortProductsForView(listedRows, view);
  const rows = sortedRows.slice(0, maxRows);
  const visibleProductIds = rows.map((row) => row?.id).filter(Boolean);
  let variantByProduct = new Map();
  if (visibleProductIds.length) {
    let variantRows = [];
    const variantSelects = [
      "id, product_id, name, price, old_price, unit, stock_count, is_default, is_active, market_id, currency_code, purchase_mode, min_quantity, max_quantity, step_quantity, base_unit, base_quantity, weight_min, weight_max, weight_unit, volume_min, volume_max, volume_unit, option_role",
      "id, product_id, name, price, old_price, unit, stock_count, is_default, is_active, market_id, currency_code, purchase_mode, min_quantity, max_quantity, step_quantity, base_unit, base_quantity",
    ];
    for (const select of variantSelects) {
      const result = await admin
        .from("product_variants")
        .select(select)
        .in("product_id", visibleProductIds)
        .eq("market_id", catalog.market.id);
      if (!result.error) {
        variantRows = Array.isArray(result.data) ? result.data : [];
        break;
      }
    }
    const groupedVariants = new Map();
    (Array.isArray(variantRows) ? variantRows : []).forEach((variant) => {
      const key = String(variant?.product_id || "");
      if (!key) return;
      if (!groupedVariants.has(key)) groupedVariants.set(key, []);
      groupedVariants.get(key).push(variant);
    });
    variantByProduct = new Map(
      Array.from(groupedVariants.entries()).map(([productId, variants]) => [
        productId,
        selectProductCardVariant(variants, { marketId: catalog.market.id }),
      ])
    );
  }
  const flat = rows
    .map((row) => overlayVariantMetadata(buildPublicCatalogProduct(row, categoryIndex), variantByProduct.get(String(row?.id || ""))))
    .filter(isVisibleCatalogProduct);
  const hydratedFlat = await attachPublicProductVariations(admin, flat, catalog.market);

  return {
    grouped: groupProducts(hydratedFlat),
    flat: hydratedFlat,
    market: publicMarket(catalog.market),
  };
}

export function toProductCardDTO(product = {}) {
  const id = String(product?.id || "").trim();
  const variantId = String(product?.variantId || product?.variant_id || id).trim();
  const cardImage = resolveProductImage(product?.cardImageUrl, product?.card_image_url, product?.image, product?.mainImageUrl);
  return {
    id,
    variantId,
    name: String(product?.name || "Fresh produce"),
    image: cardImage,
    mainImageUrl: cardImage,
    thumbImageUrl: resolveProductImage(product?.thumbImageUrl, product?.thumb_image_url, cardImage),
    cardImageUrl: cardImage,
    detailImageUrl: resolveProductImage(product?.detailImageUrl, product?.detail_image_url, cardImage),
    price: Number(product?.price || 0) || 0,
    oldPrice: Number(product?.oldPrice || product?.price || 0) || 0,
    availabilityMode: String(product?.availabilityMode ?? product?.availability_mode ?? "standard"),
    availability_mode: String(product?.availability_mode ?? product?.availabilityMode ?? "standard"),
    unit: String(product?.unit || ""),
    stock: product?.stock ?? "",
    inSeason: product?.inSeason !== false,
    discount: Number(product?.discount || 0) || 0,
    variantCount: Number(product?.variantCount || product?.active_variant_count || 0) || 0,
    hasMultipleOptions: Boolean(
      product?.hasMultipleOptions ?? Number(product?.variantCount || product?.active_variant_count || 0) > 1
    ),
    category: String(product?.category || ""),
    categorySlug: String(product?.categorySlug || ""),
    variantName: String(product?.variantName || ""),
    promoTagEnabled: Boolean(product?.promoTagEnabled),
    promoTagText: String(product?.promoTagText || ""),
    promoTagExpiresAt: product?.promoTagExpiresAt || null,
    purchaseMode: product?.purchaseMode || product?.purchase_mode || undefined,
    purchase_mode: product?.purchase_mode || product?.purchaseMode || undefined,
    minQuantity: numberOrNull(product?.minQuantity ?? product?.min_quantity),
    min_quantity: numberOrNull(product?.min_quantity ?? product?.minQuantity),
    maxQuantity: numberOrNull(product?.maxQuantity ?? product?.max_quantity),
    max_quantity: numberOrNull(product?.max_quantity ?? product?.maxQuantity),
    stepQuantity: numberOrNull(product?.stepQuantity ?? product?.step_quantity),
    step_quantity: numberOrNull(product?.step_quantity ?? product?.stepQuantity),
    baseUnit: textOrNull(product?.baseUnit ?? product?.base_unit),
    base_unit: textOrNull(product?.base_unit ?? product?.baseUnit),
    baseQuantity: numberOrNull(product?.baseQuantity ?? product?.base_quantity),
    base_quantity: numberOrNull(product?.base_quantity ?? product?.baseQuantity),
    weightMin: numberOrNull(product?.weightMin ?? product?.weight_min),
    weight_min: numberOrNull(product?.weight_min ?? product?.weightMin),
    weightMax: numberOrNull(product?.weightMax ?? product?.weight_max),
    weight_max: numberOrNull(product?.weight_max ?? product?.weightMax),
    weightUnit: textOrNull(product?.weightUnit ?? product?.weight_unit),
    weight_unit: textOrNull(product?.weight_unit ?? product?.weightUnit),
    volumeMin: numberOrNull(product?.volumeMin ?? product?.volume_min),
    volume_min: numberOrNull(product?.volume_min ?? product?.volumeMin),
    volumeMax: numberOrNull(product?.volumeMax ?? product?.volume_max),
    volume_max: numberOrNull(product?.volume_max ?? product?.volumeMax),
    volumeUnit: textOrNull(product?.volumeUnit ?? product?.volume_unit),
    volume_unit: textOrNull(product?.volume_unit ?? product?.volumeUnit),
    optionRole: textOrNull(product?.optionRole ?? product?.option_role),
    option_role: textOrNull(product?.option_role ?? product?.optionRole),
    variations: Array.isArray(product?.variations) ? product.variations : [],
    optionsLoaded: product?.optionsLoaded === true,
  };
}

export async function loadPublicSearchResults({
  search,
  page = 1,
  pageSize = 12,
} = {}) {
  const query = String(search || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.min(Math.max(Number.parseInt(pageSize, 10) || 12, 1), 24);
  if (!query) {
    return {
      items: [],
      page: safePage,
      pageSize: safePageSize,
      hasMore: false,
      returned: 0,
      market: null,
    };
  }

  const payload = await loadPublicCatalogPage({
    search: query,
    page: safePage,
    pageSize: safePageSize,
  });
  const items = (Array.isArray(payload?.flat) ? payload.flat : []).map(toProductCardDTO).filter((product) => product.id);
  const pagination = payload?.pagination || normalizeCatalogPagination({ page: safePage, pageSize: safePageSize });

  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: pagination.total,
    totalPages: pagination.totalPages,
    hasMore: pagination.page < pagination.totalPages,
    returned: items.length,
    market: payload?.market || null,
  };
}

export function publicCatalogJson(payload, init = {}) {
  return NextResponse.json(payload, {
    status: init.status || 200,
    headers: {
      ...PUBLIC_CATALOG_CACHE_HEADERS,
      ...(init.headers || {}),
    },
  });
}
