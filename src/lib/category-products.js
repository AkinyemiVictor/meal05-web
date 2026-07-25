import { pickFirstNumber } from "@/lib/number";
import { resolveProductImage } from "@/lib/product-image";
import { normalizeProductMerchandisingRecord } from "@/lib/product-merchandising";
import { normalizePromoEnabled, normalizePromoText, parsePromoExpiry } from "@/lib/product-promo";
import { getAvailableCount, resolveStockValueFromRow } from "@/lib/stock";
import { loadCategoryCounts, loadCategoryRows, mapCategoryRows, toCategorySlug } from "@/lib/categories-server";
import { applyMarketListing, loadMarketCatalog } from "@/lib/market-catalog-server";

const bucketName =
  process.env.NEXT_PUBLIC_SUPABASE_PRODUCT_IMAGE_BUCKET ||
  process.env.SUPABASE_PRODUCT_IMAGE_BUCKET ||
  "product-images";

const isActiveRow = (row) => row?.is_active !== false && row?.active !== false && row?.isActive !== false;

const pickFirst = (row, fields = []) => {
  for (const key of fields) {
    if (row && row[key] != null && row[key] !== "") return row[key];
  }
  return "";
};

const formatRangeValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  const rounded = Math.round(num * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const buildVolumeLabel = (row) => {
  const min = pickFirstNumber(row, ["volume_min", "volumeMin", "min_volume", "minVolume"]);
  const max = pickFirstNumber(row, ["volume_max", "volumeMax", "max_volume", "maxVolume"]);
  if (min == null || max == null) return "";
  const minLabel = formatRangeValue(min);
  const maxLabel = formatRangeValue(max);
  if (!minLabel || !maxLabel) return "";
  const unit = pickFirst(row, ["volume_unit", "volumeUnit"]);
  const suffix = unit ? String(unit).trim() : "";
  const base = Number(min) === Number(max) ? minLabel : `${minLabel}-${maxLabel}`;
  return suffix ? `${base}${suffix}` : base;
};

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
  const byProduct = {};
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const productId = row?.product_id ?? row?.productId ?? row?.product;
    if (!productId) return;
    const rawUrl = pickFirst(row, [
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
    const isPrimary = [row?.is_primary, row?.isPrimary, row?.primary, row?.is_main, row?.isMain, row?.main].some(
      (value) => value === true || value === 1 || String(value).toLowerCase() === "true"
    );
    const sortOrder = Number(row?.sort_order ?? row?.sortOrder ?? row?.order ?? 0) || 0;
    const key = String(productId);
    if (!byProduct[key]) byProduct[key] = [];
    byProduct[key].push({ url, isPrimary, sortOrder });
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

const buildVariantIndex = (rows) =>
  (Array.isArray(rows) ? rows : []).filter(isActiveRow).reduce((acc, row) => {
    const productId = row?.product_id ?? row?.productId ?? row?.product;
    if (!productId) return acc;
    const key = String(productId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

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
  ]);
  if (price == null && rawOldPrice != null) price = rawOldPrice;
  if (price == null) price = 0;

  const rawDiscount = pickFirstNumber(row, [
    "discount",
    "discount_pct",
    "discountPercent",
    "discount_percent",
    "percentage_off",
    "percent_off",
    "percentOff",
  ]);
  let oldPrice = rawOldPrice != null ? rawOldPrice : price;
  let discount = oldPrice > price && price > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  if (!discount && rawDiscount != null) {
    const pct = normaliseDiscountPercent(rawDiscount);
    if (pct && pct > 0) {
      discount = pct;
      if (!(oldPrice > price) && price > 0 && pct < 100) {
        const computed = price / (1 - pct / 100);
        if (Number.isFinite(computed)) oldPrice = Math.round(computed);
      }
    }
  }
  if (!Number.isFinite(oldPrice) || oldPrice <= 0 || oldPrice < price) oldPrice = price;
  return { price, oldPrice, discount };
};

const pickVariantLabel = (variant) =>
  buildVolumeLabel(variant) || pickFirst(variant, ["size_label", "sizeLabel", "size", "name", "label"]) || "";

const isAvailableStock = (row) => {
  const count = getAvailableCount(resolveStockValueFromRow(row));
  return count == null || count > 0;
};

const pickVariantForCard = (variants = []) => {
  if (!variants.length) return null;
  const available = variants.filter(isAvailableStock);
  const pool = available.length ? available : variants;
  const byDefault = pool.find((variant) => variant?.is_default === true);
  if (byDefault) return byDefault;
  return pool.slice().sort((a, b) => resolvePricing(a).price - resolvePricing(b).price)[0] || null;
};

const productMatchesCategory = (row, category) => {
  const categoryId = row?.category_id ?? row?.categoryId ?? row?.product_category_id ?? row?.productCategoryId;
  if (categoryId != null && String(categoryId) === String(category.id)) return true;
  const rowSlug = toCategorySlug(
    row?.category_slug || row?.categorySlug || row?.category_name || row?.category || row?.product_category
  );
  return rowSlug && rowSlug === category.slug;
};

const mapProductRow = (row, category, imageIndex, variantIndex) => {
  const productId = row?.id ?? row?.product_id;
  const variants = variantIndex[String(productId)] || [];
  const chosenVariant = pickVariantForCard(variants);
  const { price, oldPrice, discount } = resolvePricing(chosenVariant || row);
  const stock = chosenVariant ? resolveStockValueFromRow(chosenVariant) : resolveStockValueFromRow(row);
  const gallery = imageIndex[String(productId)] || [];
  const mainImageUrl = resolveProductImage(
    gallery[0],
    chosenVariant?.variant_image_url,
    chosenVariant?.image_url,
    row?.main_image_url,
    row?.image,
    row?.image_url
  );
  const merchandising = normalizeProductMerchandisingRecord(row);

  return {
    id: String(productId ?? ""),
    variantId: chosenVariant?.id ? String(chosenVariant.id) : String(productId ?? ""),
    variantName: chosenVariant ? pickVariantLabel(chosenVariant) : "",
    name: row?.product_name || row?.name || "Fresh produce",
    marketId: row?.market_id || "",
    currencyCode: chosenVariant?.currency_code || row?.currency_code || "",
    currencySymbol: row?.currency_symbol || "",
    locale: row?.locale || "",
    image: mainImageUrl,
    mainImageUrl,
    galleryImageUrls: gallery.length ? gallery.map((image) => resolveProductImage(image, mainImageUrl)) : [mainImageUrl],
    price,
    oldPrice,
    unit:
      pickFirst(chosenVariant || {}, ["unit", "unit_label", "unitLabel", "unit_name", "unitName"]) ||
      pickFirst(row, ["unit", "unit_label", "unitLabel", "unit_name", "unitName"]),
    stock: variants.length && !variants.some(isAvailableStock) ? 0 : stock,
    inSeason: typeof row?.in_season === "boolean" ? row.in_season : Boolean(row?.inSeason ?? true),
    discount,
    category: category.name || category.label,
    categorySlug: category.slug,
    variants: variants.map((variant) => ({
      ...variant,
      stock: resolveStockValueFromRow(variant),
      isSelectable: isAvailableStock(variant),
    })),
    promoTagEnabled: normalizePromoEnabled(
      row?.promo_tag_enabled ?? row?.promoTagEnabled ?? row?.promo_enabled ?? row?.promoEnabled
    ),
    promoTagText: normalizePromoText(row?.promo_tag_text ?? row?.promoTagText ?? row?.promo_text ?? row?.promoText),
    promoTagExpiresAt: parsePromoExpiry(
      row?.promo_tag_expires_at ?? row?.promoTagExpiresAt ?? row?.promo_expires_at ?? row?.promoExpiresAt
    ),
    ...merchandising,
  };
};

export const loadCategoryProductsPayload = async (supabase, slug) => {
  const catalog = await loadMarketCatalog(supabase);
  const requestedSlug = toCategorySlug(slug);
  const rows = await loadCategoryRows(supabase);
  const counts = await loadCategoryCounts(supabase);
  const categories = mapCategoryRows(rows, counts);
  const category = categories.find((entry) => entry.slug === requestedSlug) || null;
  if (!category) return { category: null, products: [], categories };

  const { data: productRows, error } = await supabase.from("products").select("*").eq("is_active", true);
  if (error) throw error;
  const products = (Array.isArray(productRows) ? productRows : [])
    .filter(isActiveRow)
    .map((row) => applyMarketListing(row, catalog))
    .filter(Boolean)
    .filter((row) => productMatchesCategory(row, category));
  const productIds = products.map((row) => row?.id ?? row?.product_id).filter(Boolean);

  let imageIndex = {};
  let variantIndex = {};
  if (productIds.length) {
    const [imageResult, variantResult] = await Promise.allSettled([
      supabase.from("product_images").select("*").in("product_id", productIds),
      supabase.from("product_variants").select("*").in("product_id", productIds).eq("market_id", catalog.market.id),
    ]);
    if (imageResult.status === "fulfilled" && !imageResult.value?.error) {
      imageIndex = buildImageIndex(imageResult.value?.data, supabase.storage);
    }
    if (variantResult.status === "fulfilled" && !variantResult.value?.error) {
      variantIndex = buildVariantIndex(variantResult.value?.data);
    }
  }

  return {
    category,
    categories,
    market: catalog.market,
    products: products
      .map((row) => mapProductRow(row, category, imageIndex, variantIndex))
      .filter((product) => product?.id && product.isHidden !== true),
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
