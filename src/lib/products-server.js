import { unstable_cache } from "next/cache";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { pickFirstNumber } from "@/lib/number";
import { getAvailableCount, resolveStockValueFromRow } from "@/lib/stock";
import { resolveProductImage } from "@/lib/product-image";
import { toCategorySlug } from "@/lib/categories-server";
import { normalizeProductMerchandisingRecord } from "@/lib/product-merchandising";
import { normalizePromoEnabled, normalizePromoText, parsePromoExpiry } from "@/lib/product-promo";
import { buildPackagingMetadata } from "@/lib/packaging-fees";
import { applyMarketListing, loadMarketCatalog } from "@/lib/market-catalog-server";
import { getVariantPurchaseRules } from "@/lib/purchase-quantities";

const pickFirst = (row, fields = []) => {
  for (const key of fields) {
    if (row && row[key] != null && row[key] !== "") return row[key];
  }
  return "";
};

const numberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const textOrNull = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
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

const buildExactOrRangeLabel = (min, max, unit = "", { collapseEqual = false } = {}) => {
  if (min == null || max == null) return "";
  const minLabel = formatRangeValue(min);
  const maxLabel = formatRangeValue(max);
  if (!minLabel || !maxLabel) return "";
  const suffix = unit ? String(unit).trim() : "";
  const base = collapseEqual && Number(min) === Number(max) ? minLabel : `${minLabel}-${maxLabel}`;
  return suffix ? `${base}${suffix}` : base;
};

const buildVolumeLabel = (row) => {
  const min = pickFirstNumber(row, ["volume_min", "volumeMin", "min_volume", "minVolume"]);
  const max = pickFirstNumber(row, ["volume_max", "volumeMax", "max_volume", "maxVolume"]);
  return buildExactOrRangeLabel(min, max, pickFirst(row, ["volume_unit", "volumeUnit"]), { collapseEqual: true });
};

const buildWeightRangeLabel = (row) => {
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
  return buildExactOrRangeLabel(min, max, getRangeUnit(row));
};

const buildRangeLabel = (row) => buildVolumeLabel(row) || buildWeightRangeLabel(row);

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
    const rawUrl = pickFirst(row, [
      "detail_url",
      "detailUrl",
      "detail_image_url",
      "card_url",
      "cardUrl",
      "card_image_url",
      "image_url",
      "imageUrl",
      "url",
      "path",
      "public_url",
      "publicUrl",
      "src",
      "href",
    ]);
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

const slugify = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_/]+/g, "-")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]+/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();

export const buildProductSlug = (product) => {
  const id = product?.id != null ? String(product.id) : "";
  const base = slugify(product?.name || "product");
  return id ? `${base}-${id}` : base;
};

export const extractIdFromSlug = (slug) => {
  if (!slug) return "";
  const match = String(slug).match(/-(\d+)$/);
  return match ? match[1] : "";
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

const mapRow = (row) => {
  const { price, oldPrice, discount } = resolvePricing(row);
  const stockValue = resolveStockValueFromRow(row);
  const gallery = row.galleryImageUrls || row.gallery_image_urls || [];
  const mainImageUrl = resolveProductImage(row.mainImageUrl, row.main_image_url, row.image, row.image_url);
  const galleryImageUrls = Array.isArray(gallery) && gallery.length ? gallery : mainImageUrl ? [mainImageUrl] : [];
  const merchandising = normalizeProductMerchandisingRecord(row);
  const purchaseRules = getVariantPurchaseRules(row);
  return {
    id: String(row.id ?? ""),
    name: row.name || "Fresh produce",
    marketId: row.market_id || "",
    currencyCode: row.currency_code || "",
    currencySymbol: row.currency_symbol || "",
    locale: row.locale || "",
    image: mainImageUrl,
    mainImageUrl,
    galleryImageUrls,
    price,
    oldPrice,
    unit: pickFirst(row, ["unit", "unit_label", "unitLabel", "unit_name", "unitName"]) || "",
    stock: stockValue,
    inSeason: typeof row.inSeason === "boolean" ? row.inSeason : Boolean(row.in_season ?? true),
    discount,
    purchaseMode: purchaseRules.purchaseMode,
    purchase_mode: purchaseRules.purchaseMode,
    minQuantity: purchaseRules.minQuantity,
    min_quantity: purchaseRules.minQuantity,
    maxQuantity: purchaseRules.maxQuantity,
    max_quantity: purchaseRules.maxQuantity,
    stepQuantity: purchaseRules.stepQuantity,
    step_quantity: purchaseRules.stepQuantity,
    baseUnit: purchaseRules.baseUnit || null,
    base_unit: purchaseRules.baseUnit || null,
    baseQuantity: purchaseRules.baseQuantity ?? null,
    base_quantity: purchaseRules.baseQuantity ?? null,
    weightMin: numberOrNull(row?.weight_min ?? row?.weightMin),
    weight_min: numberOrNull(row?.weight_min ?? row?.weightMin),
    weightMax: numberOrNull(row?.weight_max ?? row?.weightMax),
    weight_max: numberOrNull(row?.weight_max ?? row?.weightMax),
    weightUnit: textOrNull(row?.weight_unit ?? row?.weightUnit),
    weight_unit: textOrNull(row?.weight_unit ?? row?.weightUnit),
    volumeMin: numberOrNull(row?.volume_min ?? row?.volumeMin),
    volume_min: numberOrNull(row?.volume_min ?? row?.volumeMin),
    volumeMax: numberOrNull(row?.volume_max ?? row?.volumeMax),
    volume_max: numberOrNull(row?.volume_max ?? row?.volumeMax),
    volumeUnit: textOrNull(row?.volume_unit ?? row?.volumeUnit),
    volume_unit: textOrNull(row?.volume_unit ?? row?.volumeUnit),
    optionRole: textOrNull(row?.option_role ?? row?.optionRole),
    option_role: textOrNull(row?.option_role ?? row?.optionRole),
    category: pickFirst(row, ["category", "category_name", "categoryName", "product_category", "productCategory", "category_slug", "categorySlug"]),
    categorySlug: pickFirst(row, ["category_slug", "categorySlug"]),
    promoTagEnabled: normalizePromoEnabled(
      pickFirst(row, ["promo_tag_enabled", "promoTagEnabled", "promo_enabled", "promoEnabled"])
    ),
    promoTagText: normalizePromoText(pickFirst(row, ["promo_tag_text", "promoTagText", "promo_text", "promoText"])),
    promoTagExpiresAt: parsePromoExpiry(
      pickFirst(row, ["promo_tag_expires_at", "promoTagExpiresAt", "promo_expires_at", "promoExpiresAt"])
    ),
    ...buildPackagingMetadata(row),
    ...merchandising,
  };
};

export const fetchAllProducts = async () => {
  const admin = getSupabaseAdminClient();
  const catalog = await loadMarketCatalog(admin);
  const { data, error } = await admin.from("products").select("*", { head: false });
  if (error) throw error;

  const rows = (Array.isArray(data) ? data : []).map((row) => applyMarketListing(row, catalog)).filter(Boolean);
  let imageIndex = {};
  try {
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length) {
      const { data: imageRows, error: imgError } = await admin
        .from("product_images")
        .select("*")
        .in("product_id", ids);
      if (!imgError && Array.isArray(imageRows)) {
        imageIndex = buildImageIndex(imageRows, admin.storage);
      }
    }
  } catch (_) {
    imageIndex = {};
  }

  const merged = rows.map((row) => {
    const gallery = imageIndex[row.id] || [];
    const mainImageUrl = resolveProductImage(gallery[0], row.image, row.image_url);
    return mapRow({ ...row, mainImageUrl, galleryImageUrls: gallery });
  });
  return merged.filter((product) => product?.isHidden !== true);
};

const fetchProductByIdUncached = async (id) => {
  const admin = getSupabaseAdminClient();
  const catalog = await loadMarketCatalog(admin);
  const { data, error } = await admin
    .from("products")
    .select("*", { head: false })
    .eq("id", id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const marketData = data ? applyMarketListing(data, catalog) : null;
  if (!marketData) return { product: null, raw: null };
  if (normalizeProductMerchandisingRecord(marketData).isHidden) {
    return { product: null, raw: null };
  }
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

  const [imageResult, variantsResult] = await Promise.allSettled([
    admin.from("product_images").select("*").eq("product_id", id),
    admin.from("product_variants").select("*", { head: false }).eq("product_id", id).eq("market_id", catalog.market.id).order("id", { ascending: true }),
  ]);

  let imageIndex = {};
  if (imageResult.status === "fulfilled") {
    const { data: imageRows, error: imgError } = imageResult.value || {};
    if (!imgError && Array.isArray(imageRows)) {
      imageIndex = buildImageIndex(imageRows, admin.storage);
    }
  }
  const gallery = imageIndex[id] || [];
  const mainImageUrl = resolveProductImage(gallery[0], marketData.image, marketData.image_url);
  const galleryImageUrls = gallery.length ? gallery : mainImageUrl ? [mainImageUrl] : [];

  // Try to load structured variations from a dedicated variants table if present
  let variations = [];
  if (variantsResult.status === "fulfilled") {
    const { data: variantsData, error: variantsError } = variantsResult.value || {};
    if (!variantsError && Array.isArray(variantsData)) {
      variations = variantsData.map((row) => {
        const rangeLabel = buildRangeLabel(row);
        const sizeLabel = rangeLabel || row.size_label || row.sizeLabel || row.size || undefined;
        const stock = resolveVariantStock(row);
        const purchaseRules = getVariantPurchaseRules(row);
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
        const baseUnit = String(row.base_unit ?? row.baseUnit ?? "").trim();
        const baseQuantity = pickFirstNumber(row, ["base_quantity", "baseQuantity"], null);

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
          purchaseMode: purchaseRules.purchaseMode,
          minQuantity: purchaseRules.minQuantity,
          maxQuantity: purchaseRules.maxQuantity,
          stepQuantity: purchaseRules.stepQuantity,
          baseUnit: baseUnit || null,
          baseQuantity: baseQuantity != null ? baseQuantity : null,
          weightMin: numberOrNull(row.weight_min ?? row.weightMin),
          weightMax: numberOrNull(row.weight_max ?? row.weightMax),
          weightUnit: textOrNull(row.weight_unit ?? row.weightUnit),
          volumeMin: numberOrNull(row.volume_min ?? row.volumeMin),
          volumeMax: numberOrNull(row.volume_max ?? row.volumeMax),
          volumeUnit: textOrNull(row.volume_unit ?? row.volumeUnit),
          optionRole: textOrNull(row.option_role ?? row.optionRole),
          purchase_mode: purchaseRules.purchaseMode,
          min_quantity: purchaseRules.minQuantity,
          max_quantity: purchaseRules.maxQuantity,
          step_quantity: purchaseRules.stepQuantity,
          base_unit: baseUnit || null,
          base_quantity: baseQuantity != null ? baseQuantity : null,
          weight_min: numberOrNull(row.weight_min ?? row.weightMin),
          weight_max: numberOrNull(row.weight_max ?? row.weightMax),
          weight_unit: textOrNull(row.weight_unit ?? row.weightUnit),
          volume_min: numberOrNull(row.volume_min ?? row.volumeMin),
          volume_max: numberOrNull(row.volume_max ?? row.volumeMax),
          volume_unit: textOrNull(row.volume_unit ?? row.volumeUnit),
          option_role: textOrNull(row.option_role ?? row.optionRole),
          stock,
          stockCount: row.stock_count ?? undefined,
          inSeason: row.in_season ?? undefined,
          image: resolveProductImage(row.variant_image_url, row.image_url, row.image, mainImageUrl),
          category: pickFirst(row, ["category", "category_name", "categoryName"]) || undefined,
          is_default: row.is_default === true,
          isSelectable: isVariantSelectable({ ...row, stock }),
        };
      });
    }
  }

  const pickCheapest = (list = []) =>
    list.reduce((best, v) => {
      if (!best) return v;
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
  const defaultVariantId = defaultVariation?.variationId ? String(defaultVariation.variationId) : null;

  const raw = variations.length
    ? { ...marketData, ...(categoryMeta || {}), variations, main_image_url: mainImageUrl, gallery_image_urls: galleryImageUrls }
    : { ...marketData, ...(categoryMeta || {}), main_image_url: mainImageUrl, gallery_image_urls: galleryImageUrls };
  const baseProduct = mapRow({ ...raw, mainImageUrl, galleryImageUrls });
  const effectiveStock = variations.length && !selectableVariations.length ? 0 : defaultVariation?.stock ?? baseProduct.stock;
  const effectivePrice = defaultVariation?.price ?? baseProduct.price;
  const effectiveOldPrice = defaultVariation?.oldPrice ?? baseProduct.oldPrice;
  const effectiveUnit = defaultVariation?.unit || baseProduct.unit;
  const effectiveDiscount =
    Number.isFinite(Number(defaultVariation?.oldPrice)) &&
    Number.isFinite(Number(defaultVariation?.price)) &&
    Number(defaultVariation.oldPrice) > Number(defaultVariation.price)
      ? Math.round(((Number(defaultVariation.oldPrice) - Number(defaultVariation.price)) / Number(defaultVariation.oldPrice)) * 100)
      : baseProduct.discount;
  const purchaseRules = getVariantPurchaseRules(defaultVariation || marketData);
  return {
    product: {
      ...baseProduct,
      variantId: defaultVariantId || String(id),
      stock: effectiveStock,
      price: effectivePrice,
      oldPrice: effectiveOldPrice,
      unit: effectiveUnit,
      discount: effectiveDiscount,
      purchaseMode: purchaseRules.purchaseMode,
      purchase_mode: purchaseRules.purchaseMode,
      minQuantity: purchaseRules.minQuantity,
      min_quantity: purchaseRules.minQuantity,
      maxQuantity: purchaseRules.maxQuantity,
      max_quantity: purchaseRules.maxQuantity,
      stepQuantity: purchaseRules.stepQuantity,
      step_quantity: purchaseRules.stepQuantity,
      baseUnit: purchaseRules.baseUnit || null,
      base_unit: purchaseRules.baseUnit || null,
      baseQuantity: purchaseRules.baseQuantity ?? null,
      base_quantity: purchaseRules.baseQuantity ?? null,
      weightMin: numberOrNull(defaultVariation?.weight_min ?? defaultVariation?.weightMin ?? marketData?.weight_min ?? marketData?.weightMin),
      weight_min: numberOrNull(defaultVariation?.weight_min ?? defaultVariation?.weightMin ?? marketData?.weight_min ?? marketData?.weightMin),
      weightMax: numberOrNull(defaultVariation?.weight_max ?? defaultVariation?.weightMax ?? marketData?.weight_max ?? marketData?.weightMax),
      weight_max: numberOrNull(defaultVariation?.weight_max ?? defaultVariation?.weightMax ?? marketData?.weight_max ?? marketData?.weightMax),
      weightUnit: textOrNull(defaultVariation?.weight_unit ?? defaultVariation?.weightUnit ?? marketData?.weight_unit ?? marketData?.weightUnit),
      weight_unit: textOrNull(defaultVariation?.weight_unit ?? defaultVariation?.weightUnit ?? marketData?.weight_unit ?? marketData?.weightUnit),
      volumeMin: numberOrNull(defaultVariation?.volume_min ?? defaultVariation?.volumeMin ?? marketData?.volume_min ?? marketData?.volumeMin),
      volume_min: numberOrNull(defaultVariation?.volume_min ?? defaultVariation?.volumeMin ?? marketData?.volume_min ?? marketData?.volumeMin),
      volumeMax: numberOrNull(defaultVariation?.volume_max ?? defaultVariation?.volumeMax ?? marketData?.volume_max ?? marketData?.volumeMax),
      volume_max: numberOrNull(defaultVariation?.volume_max ?? defaultVariation?.volumeMax ?? marketData?.volume_max ?? marketData?.volumeMax),
      volumeUnit: textOrNull(defaultVariation?.volume_unit ?? defaultVariation?.volumeUnit ?? marketData?.volume_unit ?? marketData?.volumeUnit),
      volume_unit: textOrNull(defaultVariation?.volume_unit ?? defaultVariation?.volumeUnit ?? marketData?.volume_unit ?? marketData?.volumeUnit),
      optionRole: textOrNull(defaultVariation?.option_role ?? defaultVariation?.optionRole ?? marketData?.option_role ?? marketData?.optionRole),
      option_role: textOrNull(defaultVariation?.option_role ?? defaultVariation?.optionRole ?? marketData?.option_role ?? marketData?.optionRole),
    },
    raw,
    defaultVariantId,
  };
};

const fetchProductByIdCached = unstable_cache(
  async (id) => fetchProductByIdUncached(id),
  ["product-by-id"],
  {
    revalidate: 300,
  }
);

export const fetchProductById = async (id) => fetchProductByIdCached(id);

export const fetchProductBySlug = async (slug) => {
  const id = extractIdFromSlug(slug);
  if (!id) return { product: null, raw: null };
  return fetchProductById(id);
};

const productsServer = {
  buildProductSlug,
  extractIdFromSlug,
  fetchAllProducts,
  fetchProductById,
  fetchProductBySlug,
};

export default productsServer;
