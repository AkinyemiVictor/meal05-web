import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { pickFirstNumber } from "@/lib/number";
import { getAvailableCount, resolveStockValueFromRow } from "@/lib/stock";
import { resolveProductImage } from "@/lib/product-image";
import { toCategorySlug } from "@/lib/categories-server";
import { normalizeProductMerchandisingRecord } from "@/lib/product-merchandising";
import { normalizePromoEnabled, normalizePromoText, parsePromoExpiry } from "@/lib/product-promo";
import { buildPackagingMetadata } from "@/lib/packaging-fees";
import { applyMarketListing, loadMarketCatalog, publicMarket } from "@/lib/market-catalog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;
export const fetchCache = "default-cache";

const PUBLIC_PRODUCT_DETAIL_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  "CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
  "Vercel-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

const methodNotAllowed = () =>
  NextResponse.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "GET" } });

const pickFirst = (row, fields = []) => {
  for (const key of fields) {
    if (row && row[key] != null && row[key] !== "") return row[key];
  }
  return "";
};

const formatRangeValue = (value) => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const isWeightUnit = (value) => {
  const unit = String(value || "").trim().toLowerCase();
  return ["kg", "g", "lb", "lbs", "oz"].includes(unit);
};

const getRangeUnit = (row) => {
  const unit = pickFirst(row, [
    "base_unit",
    "baseUnit",
    "size_unit",
    "sizeUnit",
    "weight_unit",
    "weightUnit",
    "range_unit",
    "rangeUnit",
    "unit_label",
    "unitLabel",
  ]);
  if (unit) return String(unit).trim();
  const fallback = pickFirst(row, ["unit"]);
  return isWeightUnit(fallback) ? String(fallback).trim() : "";
};

const buildRangeLabel = (row) => {
  const min = pickFirstNumber(row, [
    "min_weight",
    "minWeight",
    "weight_min",
    "weightMin",
    "min_size",
    "minSize",
    "size_min",
    "sizeMin",
    "range_min",
    "rangeMin",
    "min_range",
    "minRange",
    "min_value",
    "minValue",
  ]);
  const max = pickFirstNumber(row, [
    "max_weight",
    "maxWeight",
    "weight_max",
    "weightMax",
    "max_size",
    "maxSize",
    "size_max",
    "sizeMax",
    "range_max",
    "rangeMax",
    "max_range",
    "maxRange",
    "max_value",
    "maxValue",
  ]);
  if (min == null || max == null) return "";
  const minLabel = formatRangeValue(min);
  const maxLabel = formatRangeValue(max);
  if (!minLabel || !maxLabel) return "";
  const unit = getRangeUnit(row);
  const base = `${minLabel}-${maxLabel}`;
  return unit ? `${base}${unit}` : base;
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

const resolveVariantStock = (row) => resolveStockValueFromRow(row);
const isVariantSelectable = (variant) => {
  if (!variant || typeof variant !== "object") return false;
  if (variant.is_active === false) return false;
  const stockValue = resolveVariantStock(variant);
  const count = getAvailableCount(stockValue);
  if (count === 0) return false;
  return true;
};

const bucketName =
  process.env.NEXT_PUBLIC_SUPABASE_PRODUCT_IMAGE_BUCKET ||
  process.env.SUPABASE_PRODUCT_IMAGE_BUCKET ||
  "product-images";

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

export async function GET(_request, { params }) {
  const { id } = (await params) || {};
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const admin = getSupabaseAdminClient();
  const catalog = await loadMarketCatalog(admin);
  const { data, error } = await admin.from("products").select("*", { head: false }).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const marketData = data ? applyMarketListing(data, catalog) : null;
  if (!marketData) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const merchandising = normalizeProductMerchandisingRecord(marketData);
  if (merchandising.isHidden) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  let imageIndex = {};
  try {
    const { data: imageRows, error: imgError } = await admin
      .from("product_images")
      .select("*")
      .eq("product_id", id);
    if (!imgError && Array.isArray(imageRows)) {
      imageIndex = buildImageIndex(imageRows, admin.storage);
    }
  } catch (_) {
    imageIndex = {};
  }

  const galleryImageUrls = imageIndex[id] || [];
  const mainImageUrl = resolveProductImage(galleryImageUrls[0], marketData.image_url, marketData.image);
  let categoryMeta = null;
  const categoryId = marketData?.category_id ?? marketData?.categoryId ?? marketData?.product_category_id ?? marketData?.productCategoryId;
  if (categoryId != null) {
    try {
      const { data: categoryRow, error: categoryError } = await admin
        .from("product_categories")
        .select("*")
        .eq("id", categoryId)
        .maybeSingle();
      if (!categoryError && categoryRow) {
        const categoryLabel = String(
          categoryRow.name ||
            categoryRow.label ||
            categoryRow.title ||
            categoryRow.category_name ||
            categoryRow.categoryName ||
            ""
        ).trim();
        categoryMeta = {
          category: categoryLabel,
          categorySlug: toCategorySlug(
            categoryRow.slug || categoryRow.category_slug || categoryRow.categorySlug || categoryLabel
          ),
        };
      }
    } catch {}
  }

  // Try to include variants if table exists
  let variations = [];
  try {
    const { data: variants, error: vError } = await admin
      .from("product_variants")
      .select("*", { head: false })
      .eq("product_id", id)
      .eq("market_id", catalog.market.id)
      .order("id", { ascending: true });
    if (!vError && Array.isArray(variants)) {
      variations = variants.map((row) => {
        const rangeLabel = buildRangeLabel(row);
        const sizeLabel = rangeLabel || row.size_label || row.sizeLabel || row.size || undefined;
        const stock = resolveVariantStock(row);
        const variantPrice = pickFirstNumber(row, [
          "price",
          "unit_price",
          "unitPrice",
          "sale_price",
          "salePrice",
          "selling_price",
          "sellingPrice",
          "current_price",
          "currentPrice",
        ]);
        const variantOldPrice = pickFirstNumber(row, [
          "oldPrice",
          "old_price",
          "compare_at_price",
          "compareAtPrice",
          "list_price",
          "listPrice",
          "regular_price",
          "regularPrice",
          "msrp",
        ]);

        return {
          variationId: row.id,
          name: rangeLabel || row.size_label || row.name || row.ripeness || row.label || "Option",
          ripeness: row.ripeness || undefined,
          size: row.size || row.size_label || undefined,
          sizeLabel,
          packaging: row.packaging || undefined,
          price: variantPrice != null ? variantPrice : undefined,
          oldPrice: variantOldPrice != null ? variantOldPrice : undefined,
          unit: pickFirst(row, ["unit", "unit_label", "unitLabel", "unit_name", "unitName"]) || marketData.unit || undefined,
          currencyCode: row.currency_code || catalog.market.currencyCode,
          stock,
          stockCount: row.stock_count ?? undefined,
          inSeason: row.in_season ?? undefined,
          image: resolveProductImage(row.variant_image_url, row.image_url, row.image, mainImageUrl),
          category: pickFirst(row, ["category", "category_name", "categoryName"]) || categoryMeta?.category || undefined,
          categorySlug: categoryMeta?.categorySlug || undefined,
          is_default: row.is_default === true,
          isSelectable: isVariantSelectable({ ...row, stock }),
          ...buildPackagingMetadata({
            ...row,
            name: marketData?.name,
            category: pickFirst(row, ["category", "category_name", "categoryName"]) || categoryMeta?.category || "",
            categorySlug: categoryMeta?.categorySlug || "",
          }),
        };
      });
    }
  } catch (_) {}

  const pickCheapest = (list = []) =>
    list.reduce((best, v) => {
      const bestPrice = Number(best?.price ?? Number.POSITIVE_INFINITY);
      const vPrice = Number(v?.price ?? Number.POSITIVE_INFINITY);
      return vPrice < bestPrice ? v : best;
    }, null);
  const selectableVariations = variations.filter((v) => v?.isSelectable !== false);
  const defaultVariation =
    selectableVariations.find((v) => v.is_default) ||
    pickCheapest(selectableVariations) ||
    variations.find((v) => v.is_default) ||
    pickCheapest(variations) ||
    null;
  const defaultVariantId = defaultVariation?.variationId ? String(defaultVariation.variationId) : String(id);

  const pricing = resolvePricing(defaultVariation || marketData);
  const unitValue =
    pickFirst(defaultVariation || {}, ["unit", "unit_label", "unitLabel", "unit_name", "unitName"]) ||
    pickFirst(marketData, ["unit", "unit_label", "unitLabel", "unit_name", "unitName"]) ||
    marketData.unit ||
    "";
  const stockValue = defaultVariation ? defaultVariation.stock : resolveStockValueFromRow(marketData);
  const effectiveStock = variations.length && !selectableVariations.length ? 0 : stockValue;

  return NextResponse.json(
    {
      product: {
        ...marketData,
        ...(categoryMeta || {}),
        id: String(marketData.id),
        marketId: catalog.market.id,
        currencyCode: defaultVariation?.currencyCode || catalog.market.currencyCode,
        currencySymbol: catalog.market.currencySymbol,
        locale: catalog.market.locale,
        image: mainImageUrl,
        main_image_url: mainImageUrl,
        gallery_image_urls: galleryImageUrls,
        variantId: defaultVariantId,
        price: pricing.price,
        oldPrice: pricing.oldPrice,
        discount: pricing.discount,
        unit: unitValue,
        stock: effectiveStock,
        category:
          categoryMeta?.category ||
          pickFirst(marketData, ["category", "category_name", "categoryName", "product_category", "productCategory", "category_slug", "categorySlug"]),
        categorySlug: categoryMeta?.categorySlug || pickFirst(marketData, ["category_slug", "categorySlug"]),
        promoTagEnabled: normalizePromoEnabled(marketData.promo_tag_enabled ?? marketData.promoTagEnabled),
        promoTagText: normalizePromoText(marketData.promo_tag_text ?? marketData.promoTagText),
        promoTagExpiresAt: parsePromoExpiry(marketData.promo_tag_expires_at ?? marketData.promoTagExpiresAt),
        ...buildPackagingMetadata({
          ...marketData,
          ...(categoryMeta || {}),
          name: marketData?.name,
        }),
        ...merchandising,
      },
      variations,
      defaultVariantId,
      market: publicMarket(catalog.market),
    },
    {
      headers: PUBLIC_PRODUCT_DETAIL_CACHE_HEADERS,
    }
  );
}

export function POST() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}

export function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: { Allow: "GET" } });
}
