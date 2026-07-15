import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { toCategorySlug } from "@/lib/categories-server";
import { pickFirstNumber } from "@/lib/number";
import { resolveProductImage } from "@/lib/product-image";
import { normalizeProductMerchandisingRecord } from "@/lib/product-merchandising";
import { normalizePromoEnabled, normalizePromoText, parsePromoExpiry } from "@/lib/product-promo";
import { buildPackagingMetadata } from "@/lib/packaging-fees";
import { applyMarketListing, loadMarketCatalog, publicMarket } from "@/lib/market-catalog-server";

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
  "label",
  "title",
  "slug",
  "category_name",
  "category_slug",
].join(", ");

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
  const image = resolveProductImage(row?.main_image_url, row?.image, row?.image_url);

  return {
    id: String(row?.id ?? ""),
    name: String(row?.name || "Fresh produce"),
    image,
    mainImageUrl: image,
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

export async function loadPublicCatalogProducts({
  ids,
  category,
  search,
  view = "default",
  limit = 48,
} = {}) {
  const admin = getSupabaseAdminClient();
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
  const searchTerm = String(search || "").trim().replace(/[%_]/g, "").slice(0, 80);
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
  if (searchTerm && !categoryIds.length) query = query.ilike("name", `%${searchTerm}%`);

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
  const flat = rows.map((row) => buildPublicCatalogProduct(row, categoryIndex)).filter((product) => product.id);

  return {
    grouped: groupProducts(flat),
    flat,
    market: publicMarket(catalog.market),
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
