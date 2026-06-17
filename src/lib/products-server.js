import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { pickFirstNumber } from "@/lib/number";
import { getAvailableCount, resolveStockValueFromRow } from "@/lib/stock";
import { resolveProductImage } from "@/lib/product-image";
import { normalizeProductMerchandisingRecord } from "@/lib/product-merchandising";
import { normalizePromoEnabled, normalizePromoText, parsePromoExpiry } from "@/lib/product-promo";

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

const resolveVariantStock = (row) => resolveStockValueFromRow(row);
const variantInactiveThresholdRaw =
  process.env.NEXT_PUBLIC_VARIANT_INACTIVE_STOCK_THRESHOLD ??
  process.env.VARIANT_INACTIVE_STOCK_THRESHOLD;
const variantInactiveThreshold = Number(variantInactiveThresholdRaw);
const variantInactiveStockThreshold = Number.isFinite(variantInactiveThreshold)
  ? Math.max(0, Math.floor(variantInactiveThreshold))
  : 5;
const isVariantSelectable = (variant) => {
  if (!variant || typeof variant !== "object") return false;
  if (variant.is_active === false) return false;
  const stockValue = resolveVariantStock(variant);
  const count = getAvailableCount(stockValue);
  if (count === 0) return false;
  if (Number.isFinite(count)) {
    return count > variantInactiveStockThreshold;
  }
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
  return {
    id: String(row.id ?? ""),
    name: row.name || "Fresh produce",
    image: mainImageUrl,
    mainImageUrl,
    galleryImageUrls,
    price,
    oldPrice,
    unit: pickFirst(row, ["unit", "unit_label", "unitLabel", "unit_name", "unitName"]) || "",
    stock: stockValue,
    inSeason: typeof row.inSeason === "boolean" ? row.inSeason : Boolean(row.in_season ?? true),
    discount,
    category: row.category || "",
    promoTagEnabled: normalizePromoEnabled(
      pickFirst(row, ["promo_tag_enabled", "promoTagEnabled", "promo_enabled", "promoEnabled"])
    ),
    promoTagText: normalizePromoText(pickFirst(row, ["promo_tag_text", "promoTagText", "promo_text", "promoText"])),
    promoTagExpiresAt: parsePromoExpiry(
      pickFirst(row, ["promo_tag_expires_at", "promoTagExpiresAt", "promo_expires_at", "promoExpiresAt"])
    ),
    ...merchandising,
  };
};

export const fetchAllProducts = async () => {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("products").select("*", { head: false });
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
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
  const { data, error } = await admin
    .from("products")
    .select("*", { head: false })
    .eq("id", id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { product: null, raw: null };
  if (normalizeProductMerchandisingRecord(data).isHidden) {
    return { product: null, raw: null };
  }

  const [imageResult, variantsResult] = await Promise.allSettled([
    admin.from("product_images").select("*").eq("product_id", id),
    admin.from("product_variants").select("*", { head: false }).eq("product_id", id).order("id", { ascending: true }),
  ]);

  let imageIndex = {};
  if (imageResult.status === "fulfilled") {
    const { data: imageRows, error: imgError } = imageResult.value || {};
    if (!imgError && Array.isArray(imageRows)) {
      imageIndex = buildImageIndex(imageRows, admin.storage);
    }
  }
  const gallery = imageIndex[id] || [];
  const mainImageUrl = resolveProductImage(gallery[0], data.image, data.image_url);
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
          unit: pickFirst(row, ["unit", "unit_label", "unitLabel", "unit_name", "unitName"]) || data.unit || undefined,
          stock,
          stockCount: row.stock_count ?? undefined,
          inSeason: row.in_season ?? undefined,
          image: resolveProductImage(row.variant_image_url, row.image_url, row.image, mainImageUrl),
          category: row.category || undefined,
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
    ? { ...data, variations, main_image_url: mainImageUrl, gallery_image_urls: galleryImageUrls }
    : { ...data, main_image_url: mainImageUrl, gallery_image_urls: galleryImageUrls };
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
  return {
    product: {
      ...baseProduct,
      variantId: defaultVariantId || String(id),
      stock: effectiveStock,
      price: effectivePrice,
      oldPrice: effectiveOldPrice,
      unit: effectiveUnit,
      discount: effectiveDiscount,
    },
    raw,
    defaultVariantId,
  };
};

export const fetchProductById = fetchProductByIdUncached;

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
