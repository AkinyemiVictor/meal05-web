

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { supabasePublicConfig } from "@/lib/config/supabase";
import { pickFirstNumber } from "@/lib/number";
import { getAvailableCount, resolveStockValueFromRow } from "@/lib/stock";
import { resolveProductImage } from "@/lib/product-image";
import { normalizeProductMerchandisingRecord } from "@/lib/product-merchandising";
import { normalizePromoEnabled, normalizePromoText, parsePromoExpiry } from "@/lib/product-promo";
import { applyMarketListing, loadMarketCatalog, publicMarket } from "@/lib/market-catalog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;
export const fetchCache = "default-cache";

const PUBLIC_CATALOG_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  "CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
  "Vercel-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

const toSlug = (value) => {
  // Insert separators for camelCase/PascalCase before lowercasing
  const withSeparators = String(value || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const lowered = withSeparators.toLowerCase();
  const connectors = lowered.replace(/\band\b/g, "-n-").replace(/&/g, "-n-");
  return connectors
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const pickFirst = (row, fields = []) => {
  for (const key of fields) {
    if (row && row[key] != null && row[key] !== "") return row[key];
  }
  return "";
};

const normalizeBoolean = (value) =>
  value === true || value === 1 || String(value || "").trim().toLowerCase() === "true";

const bucketName =
  process.env.NEXT_PUBLIC_SUPABASE_PRODUCT_IMAGE_BUCKET ||
  process.env.SUPABASE_PRODUCT_IMAGE_BUCKET ||
  "product-images";
const variantInactiveThresholdRaw =
  process.env.NEXT_PUBLIC_VARIANT_INACTIVE_STOCK_THRESHOLD ??
  process.env.VARIANT_INACTIVE_STOCK_THRESHOLD;
const variantInactiveThreshold = Number(variantInactiveThresholdRaw);
const variantInactiveStockThreshold = Number.isFinite(variantInactiveThreshold)
  ? Math.max(0, Math.floor(variantInactiveThreshold))
  : 5;

const toPublicUrl = (storage, pathOrUrl) => {
  if (!pathOrUrl) return "";
  const str = String(pathOrUrl);
  if (/^https?:\/\//i.test(str)) return str;
  try {
    const { data } = storage.from(bucketName).getPublicUrl(str);
    return data?.publicUrl || str;
  } catch {
    return str;
  }
};

const buildImageIndex = (rows, storage) => {
  if (!Array.isArray(rows) || !rows.length) return {};
  const byProduct = {};

  rows.forEach((row) => {
    const productId = row?.product_id ?? row?.productId ?? row?.product;
    if (!productId) return;
    const rawUrl = pickFirst(row, ["url", "image_url", "imageUrl", "path", "public_url", "publicUrl", "src", "href"]);
    const url = toPublicUrl(storage, rawUrl);
    if (!url) return;
    const isPrimary = [row?.is_primary, row?.isPrimary, row?.primary, row?.is_main, row?.isMain, row?.main]
      .some((v) => v === true || v === 1 || String(v).toLowerCase() === "true");
    const sortOrderRaw = row?.sort_order ?? row?.sortOrder ?? row?.order ?? 0;
    const sortOrder = Number.isFinite(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 0;
    if (!byProduct[productId]) byProduct[productId] = [];
    byProduct[productId].push({ url, isPrimary, sortOrder });
  });

  Object.keys(byProduct).forEach((id) => {
    byProduct[id].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });
    byProduct[id] = byProduct[id].map((entry) => entry.url);
  });

  return byProduct;
};

const buildVariantIndex = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return {};
  return rows.reduce((acc, row) => {
    const productId = row?.product_id ?? row?.productId ?? row?.product;
    if (!productId) return acc;
    if (row?.is_active === false) return acc;
    const key = String(productId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
};

const isVariantSelectable = (variant) => {
  if (!variant || typeof variant !== "object") return false;
  if (variant.is_active === false) return false;
  const stockValue = resolveStockValueFromRow(variant);
  const count = getAvailableCount(stockValue);
  if (count === 0) return false;
  if (Number.isFinite(count)) {
    return count > variantInactiveStockThreshold;
  }
  return true;
};

const pickVariantLabel = (variant) =>
  pickFirst(variant, ["size_label", "sizeLabel", "size", "name", "label"]) || "";

const pickVariantForCard = (variants = []) => {
  if (!Array.isArray(variants) || !variants.length) return null;
  const scored = variants.map((row) => {
    const stockValue = resolveStockValueFromRow(row);
    const count = getAvailableCount(stockValue);
    return {
      row,
      count,
      price: resolvePricing(row).price,
      isDefault: row?.is_default === true,
      isSelectable: isVariantSelectable(row),
    };
  });
  const selectable = scored.filter((entry) => entry.isSelectable);
  const available = scored.filter((entry) => entry.count == null || entry.count > 0);
  const pool = selectable.length ? selectable : available.length ? available : scored;
  const byDefault = pool.find((entry) => entry.isDefault);
  if (byDefault) return byDefault.row;
  const sorted = pool
    .slice()
    .sort((a, b) => {
      const aPrice = Number.isFinite(a.price) ? a.price : Number.POSITIVE_INFINITY;
      const bPrice = Number.isFinite(b.price) ? b.price : Number.POSITIVE_INFINITY;
      return aPrice - bPrice;
    });
  return sorted[0]?.row || null;
};

const normaliseDiscountPercent = (value) => {
  if (!Number.isFinite(value)) return null;
  const percent = value <= 1 ? value * 100 : value;
  if (!Number.isFinite(percent)) return null;
  if (percent <= 0) return 0;
  return Math.min(100, Math.round(percent));
};

const resolvePricing = (row) => {
  let price = pickFirstNumber(row, [
      "price",
      "unit_price",
      "unitPrice",
      "sale_price",
      "salePrice",
      "selling_price",
      "sellingPrice",
      "current_price",
      "currentPrice",
      "final_price",
      "finalPrice",
      "discounted_price",
      "discountedPrice",
      "amount",
      "amount_ngn",
      "price_ngn",
      "price_ghs",
      "price_gh",
      "price_usd",
      "priceUsd",
    ]);
  const rawOldPrice = pickFirstNumber(row, [
    "oldPrice",
    "old_price",
    "compare_at_price",
    "compareAtPrice",
    "list_price",
    "listPrice",
    "regular_price",
    "regularPrice",
    "msrp",
    "was_price",
    "wasPrice",
    "original_price",
    "originalPrice",
  ]);
  if (price == null && rawOldPrice != null) {
    price = rawOldPrice;
  }
  if (price == null) price = 0;
  const rawDiscount = pickFirstNumber(row, [
    "discount",
    "discount_pct",
    "discountPercent",
    "discount_percent",
    "percentage_off",
    "percent_off",
    "percentOff",
    "off_percent",
    "offPercent",
    "off_pct",
  ]);

  let oldPrice = rawOldPrice != null ? rawOldPrice : price;
  let discount = oldPrice > price && price > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;

  if (!discount && rawDiscount != null) {
    const pct = normaliseDiscountPercent(rawDiscount);
    if (pct && pct > 0) {
      discount = pct;
      if (!(oldPrice > price) && price > 0 && pct < 100) {
        const computed = price / (1 - pct / 100);
        if (Number.isFinite(computed)) {
          oldPrice = Math.round(computed);
        }
      }
    }
  }

  if (!Number.isFinite(oldPrice) || oldPrice <= 0) oldPrice = price;
  if (oldPrice < price) oldPrice = price;

  return { price, oldPrice, discount };
};

const mapRowToProduct = (row, imageIndex = {}, variantIndex = {}, productMetaIndex = {}) => {
  if (!row || typeof row !== "object") return null;

  const productId = row.product_id ?? row.id;
  const productMeta = productMetaIndex[String(productId)] || null;
  const variants = variantIndex[String(productId)] || [];
  const chosenVariant = pickVariantForCard(variants);
  const variantId = chosenVariant?.id ?? row.variant_id ?? row.variantId ?? null;
  const { price, oldPrice, discount } = resolvePricing(chosenVariant || row);
  const stockValue = chosenVariant ? resolveStockValueFromRow(chosenVariant) : resolveStockValueFromRow(row);
  const hasSelectableVariant = variants.some((variant) => isVariantSelectable(variant));
  const effectiveStock = variants.length && !hasSelectableVariant ? 0 : stockValue;
  const categoryName = row.category_name ?? row.category ?? "";
  const categorySlug = row.category_slug ?? row.categorySlug ?? toSlug(categoryName || "uncategorised");

  const gallery = imageIndex[String(productId)] || [];
  const fallbackImage =
    row.variant_image_url ||
    row.main_image_url ||
    row.image ||
    row.image_url ||
    row.imageUrl ||
    "";
  const mainImageUrl = resolveProductImage(gallery[0], fallbackImage);
  const galleryImageUrls = gallery.length
    ? gallery.map((image) => resolveProductImage(image, mainImageUrl))
    : [mainImageUrl];
  const merchandising = normalizeProductMerchandisingRecord({ ...productMeta, ...row });
  const collectionSlug = toSlug(
    pickFirst(row, ["collection_slug", "collectionSlug", "collection", "collection_key", "collectionKey"])
  );
  const prepMinutes = pickFirstNumber(row, [
    "prep_minutes",
    "prepMinutes",
    "delivery_minutes",
    "deliveryMinutes",
    "ready_minutes",
    "readyMinutes",
  ]);

  return {
    id: String(productId ?? ""),
    variantId: variantId ? String(variantId) : String(productId ?? ""),
    variantName: chosenVariant ? pickVariantLabel(chosenVariant) : row.size_label || "",
    name: row.product_name || row.name || "Fresh produce",
    marketId: row.market_id || "",
    currencyCode: chosenVariant?.currency_code || row.currency_code || "",
    currencySymbol: row.currency_symbol || "",
    locale: row.locale || "",
    image: mainImageUrl,
    mainImageUrl,
    galleryImageUrls,
    price,
    oldPrice,
    unit:
      pickFirst(chosenVariant || {}, ["unit", "unit_label", "unitLabel", "unit_name", "unitName"]) ||
      pickFirst(row, ["unit", "unit_label", "unitLabel", "unit_name", "unitName"]) ||
      "",
    stock: effectiveStock,
    inSeason: typeof row.in_season === "boolean" ? row.in_season : Boolean(row.inSeason ?? true),
    discount,
    category: categoryName,
    categorySlug: toSlug(categorySlug || categoryName || "uncategorised") || "uncategorised",
    promoTagEnabled: normalizePromoEnabled(
      productMeta?.promo_tag_enabled ??
        row.promo_tag_enabled ??
        row.promoTagEnabled ??
        row.promo_enabled ??
        row.promoEnabled
    ),
    promoTagText: normalizePromoText(
      productMeta?.promo_tag_text ?? row.promo_tag_text ?? row.promoTagText ?? row.promo_text ?? row.promoText
    ),
    promoTagExpiresAt: parsePromoExpiry(
      productMeta?.promo_tag_expires_at ??
        row.promo_tag_expires_at ??
        row.promoTagExpiresAt ??
        row.promo_expires_at ??
        row.promoExpiresAt
    ),
    collectionSlug,
    prepMinutes,
    isPopular: normalizeBoolean(row.is_popular ?? row.isPopular ?? row.popular),
    isChefChoice: normalizeBoolean(row.is_chef_choice ?? row.isChefChoice ?? row.chef_choice ?? row.chefChoice),
    isUnder15m: normalizeBoolean(row.is_under_15m ?? row.isUnder15m ?? row.is_under_15_min ?? row.isUnder15Minutes),
    ...merchandising,
  };
};

const mapAndGroup = (rows, imageIndex = {}, variantIndex = {}, productMetaIndex = {}) => {
  const mapped = (rows || [])
    .map((row) => mapRowToProduct(row, imageIndex, variantIndex, productMetaIndex))
    .filter(Boolean)
    .filter((product) => product.isHidden !== true);
  const grouped = mapped.reduce((acc, p) => {
    const key = p.categorySlug || "uncategorised";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
  return { mapped, grouped };
};

export async function GET(request) {
  try {
    if (!supabasePublicConfig?.url || !supabasePublicConfig?.anonKey) {
      return NextResponse.json(
        {
          error: "Supabase public credentials are missing.",
          details: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment.",
        },
        { status: 500 }
      );
    }

    let supabase;
    try {
      supabase = getSupabaseRouteClient(await cookies());
    } catch (clientErr) {
      return NextResponse.json(
        { error: "Failed to initialise Supabase client", details: clientErr?.message || String(clientErr) },
        { status: 500 }
      );
    }

    let data = [];
    let error = null;
    let imageIndex = {};
    let variantIndex = {};
    let productMetaIndex = {};
    let loadedFromBaseProductsTable = false;
    const adminClient = getSupabaseAdminClient();
    const catalog = await loadMarketCatalog(adminClient);
    const isLandingPreview = new URL(request.url).searchParams.get("view") === "landing";
    let previewProductIds = [];
    if (isLandingPreview) {
      try {
        const { data: previewRows, error: previewError } = await adminClient
          .from("products")
          .select("id,is_featured,is_hidden,is_bestseller,is_homepage_pick,created_at")
          .in("id", catalog.productIds)
          .eq("is_active", true);
        if (previewError) throw previewError;
        previewProductIds = (previewRows || [])
          .filter((row) => row.is_hidden !== true)
          .sort((left, right) => {
            const score = (row) => (row.is_homepage_pick ? 0 : row.is_featured ? 1 : row.is_bestseller ? 2 : 3);
            return score(left) - score(right) || String(right.created_at || "").localeCompare(String(left.created_at || ""));
          })
          .slice(0, 12)
          .map((row) => row.id);
        productMetaIndex = (previewRows || []).reduce((index, row) => {
          index[String(row.id)] = {
            is_featured: row.is_featured === true,
            is_hidden: row.is_hidden === true,
            is_bestseller: row.is_bestseller === true,
            is_homepage_pick: row.is_homepage_pick === true,
          };
          return index;
        }, {});
      } catch {
        previewProductIds = catalog.productIds.slice(0, 12);
      }
    }

    try {
      let query = supabase.from("products_cards_view").select("*", { head: false });
      if (isLandingPreview && previewProductIds.length) query = query.in("product_id", previewProductIds);
      const res = await query;
      data = res.data ?? [];
      error = res.error;
    } catch (err) {
      error = err;
    }

    // In local/dev only, allow temporary fallback to service role.
    if (error && process.env.NODE_ENV !== "production") {
      try {
        const admin = getSupabaseAdminClient();
        let query = admin.from("products_cards_view").select("*", { head: false });
        if (isLandingPreview && previewProductIds.length) query = query.in("product_id", previewProductIds);
        const res = await query;
        data = res.data ?? [];
        error = res.error;
        supabase = admin;
      } catch (adminErr) {
        error = adminErr;
      }
    }

    // Fallback for broken/stale DB view definitions (for example, removed columns like products.in_stock).
    if (error) {
      try {
        let query = supabase.from("products").select("*", { head: false });
        if (isLandingPreview && previewProductIds.length) query = query.in("id", previewProductIds);
        const res = await query;
        data = Array.isArray(res?.data) ? res.data : [];
        error = res?.error || null;
        loadedFromBaseProductsTable = !error;
      } catch (fallbackErr) {
        error = fallbackErr;
      }
    }

    // In local/dev, try service-role fallback for products table as a last resort.
    if (error && process.env.NODE_ENV !== "production") {
      try {
        const admin = getSupabaseAdminClient();
        let query = admin.from("products").select("*", { head: false });
        if (isLandingPreview && previewProductIds.length) query = query.in("id", previewProductIds);
        const res = await query;
        data = Array.isArray(res?.data) ? res.data : [];
        error = res?.error || null;
        if (!error) {
          supabase = admin;
          loadedFromBaseProductsTable = true;
        }
      } catch (fallbackAdminErr) {
        error = fallbackAdminErr;
      }
    }

    if (error) {
      return NextResponse.json(
        { error: "Failed to load products from Supabase", details: error?.message || String(error) },
        { status: 500 }
      );
    }

    if (loadedFromBaseProductsTable) {
      data = (Array.isArray(data) ? data : []).map((row) => ({
        ...row,
        product_id: row?.product_id ?? row?.id,
        product_name: row?.product_name ?? row?.name,
        category_name: row?.category_name ?? row?.category,
      }));
    }

    data = (Array.isArray(data) ? data : []).map((row) => applyMarketListing(row, catalog)).filter(Boolean);

    // Fetch associated product images (optional table)
    try {
      const productIds = data.map((r) => r.product_id ?? r.id).filter(Boolean);
      if (productIds.length) {
        const imageRowsPromise = Promise.resolve(
          supabase.from("product_images").select("*").in("product_id", productIds)
        );
        if (!isLandingPreview) try {
          const metadataRows = [];
          const chunkSize = 200;
          const metadataSelectCandidates = [
            "id, promo_tag_text, promo_tag_expires_at, promo_tag_enabled, is_featured, is_hidden, is_bestseller, is_new_arrival, is_homepage_pick, is_bundle_eligible",
            "id, promo_tag_text, promo_tag_expires_at, is_featured, is_hidden, is_bestseller, is_new_arrival, is_homepage_pick, is_bundle_eligible",
          ];
          for (let i = 0; i < productIds.length; i += chunkSize) {
            const slice = productIds.slice(i, i + chunkSize);
            let chunkRows = [];
            let chunkError = null;
            for (const select of metadataSelectCandidates) {
              const res = await supabase.from("products").select(select).in("id", slice);
              if (!res?.error) {
                chunkRows = Array.isArray(res?.data) ? res.data : [];
                chunkError = null;
                break;
              }
              chunkError = res.error;
            }
            if (chunkError) throw chunkError;
            metadataRows.push(...chunkRows);
          }
          productMetaIndex = metadataRows.reduce((acc, row) => {
            const key = String(row?.id || "").trim();
            if (!key) return acc;
            acc[key] = {
              promo_tag_text: row?.promo_tag_text ?? null,
              promo_tag_expires_at: row?.promo_tag_expires_at ?? null,
              promo_tag_enabled: row?.promo_tag_enabled === true,
              is_featured: row?.is_featured === true,
              is_hidden: row?.is_hidden === true,
              is_bestseller: row?.is_bestseller === true,
              is_new_arrival: row?.is_new_arrival === true,
              is_homepage_pick: row?.is_homepage_pick === true,
              is_bundle_eligible: row?.is_bundle_eligible === true,
            };
            return acc;
          }, {});
        } catch (_) {
          productMetaIndex = {};
        }

        try {
          const variants = [];
          const chunkSize = 200;
          for (let i = 0; i < productIds.length; i += chunkSize) {
            const slice = productIds.slice(i, i + chunkSize);
            const res = await supabase.from("product_variants").select("*", { head: false }).in("product_id", slice).eq("market_id", catalog.market.id);
            if (res?.error) throw res.error;
            if (Array.isArray(res?.data)) variants.push(...res.data);
          }
          variantIndex = buildVariantIndex(variants);
        } catch (variantErr) {
          if (process.env.NODE_ENV !== "production") {
            try {
              const admin = getSupabaseAdminClient();
              const variants = [];
              const chunkSize = 200;
              for (let i = 0; i < productIds.length; i += chunkSize) {
                const slice = productIds.slice(i, i + chunkSize);
                const res = await admin.from("product_variants").select("*", { head: false }).in("product_id", slice).eq("market_id", catalog.market.id);
                if (res?.error) throw res.error;
                if (Array.isArray(res?.data)) variants.push(...res.data);
              }
              variantIndex = buildVariantIndex(variants);
            } catch (_) {
              variantIndex = {};
            }
          } else {
            variantIndex = {};
          }
        }

        const { data: imageRows, error: imgError } = await imageRowsPromise;
        if (!imgError && Array.isArray(imageRows)) {
          imageIndex = buildImageIndex(imageRows, supabase.storage);
        }
      }
    } catch (_) {
      imageIndex = {};
    }

    const { mapped, grouped } = mapAndGroup(
      Array.isArray(data) ? data : [],
      imageIndex,
      variantIndex,
      productMetaIndex
    );

    return NextResponse.json(
      { grouped, flat: mapped, market: publicMarket(catalog.market) },
      {
        status: 200,
        headers: PUBLIC_CATALOG_CACHE_HEADERS,
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected server error while loading products", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
