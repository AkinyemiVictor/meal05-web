import "server-only";

import { buildProductSlug } from "@/lib/products";
import { toCategorySlug } from "@/lib/categories-server";
import { loadMarketCatalog } from "@/lib/market-catalog-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

const formatRangeValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  const rounded = Math.round(num * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const pickFirst = (row, keys = []) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && value !== "") return value;
  }
  return "";
};

const buildExactOrRangeLabel = (min, max, unit = "", { collapseEqual = false } = {}) => {
  const minLabel = formatRangeValue(min);
  const maxLabel = formatRangeValue(max);
  if (!minLabel || !maxLabel) return "";
  const suffix = unit ? String(unit).trim() : "";
  const base = collapseEqual && Number(min) === Number(max) ? minLabel : `${minLabel}-${maxLabel}`;
  return suffix ? `${base}${suffix}` : base;
};

const buildVariantVolumeLabel = (variant) =>
  buildExactOrRangeLabel(
    pickFirst(variant, ["volume_min", "volumeMin", "min_volume", "minVolume"]),
    pickFirst(variant, ["volume_max", "volumeMax", "max_volume", "maxVolume"]),
    pickFirst(variant, ["volume_unit", "volumeUnit"]),
    { collapseEqual: true }
  );

export const formatAdminPrice = (value, currencyCode = "NGN", locale = "en-NG") => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "N/A";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode || "NGN",
      maximumFractionDigits: Number.isInteger(num) ? 0 : 2,
    }).format(num);
  } catch {
    return `₦${num.toLocaleString("en-NG")}`;
  }
};

export const buildAdminVariantLabel = (variant, siblings = []) => {
  const parts = [];
  const size = pickFirst(variant, ["size", "size_label", "sizeLabel", "name"]);
  const ripeness = String(variant?.ripeness || "").trim();
  const siblingRipenessValues = new Set(
    (siblings || [])
      .map((item) => String(item?.ripeness || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const shouldShowRipeness = ripeness && siblingRipenessValues.size > 1;
  const min = pickFirst(variant, ["weight_min", "min_weight", "size_min", "min_size"]);
  const max = pickFirst(variant, ["weight_max", "max_weight", "size_max", "max_size"]);
  const unit = pickFirst(variant, ["weight_unit", "size_unit", "unit"]);
  const volume = buildVariantVolumeLabel(variant);

  if (size) parts.push(String(size).trim());
  if (shouldShowRipeness) parts.push(ripeness);

  const range = buildExactOrRangeLabel(min, max, unit);
  const base = parts.length ? parts.join(", ") : volume || "Default";
  const detail = volume && parts.length ? volume : range;
  return detail ? `${base} (${detail})` : base;
};

export const loadVolatilePriceAdminData = async () => {
  const supabase = getSupabaseAdminClient();
  const catalog = await loadMarketCatalog(supabase);

  const [productsResult, categoriesResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category_id, is_active, is_price_volatile")
      .eq("is_active", true)
      .eq("is_price_volatile", true),
    supabase.from("product_categories").select("id, name, slug, sort_order").eq("is_active", true),
  ]);

  if (productsResult.error) throw productsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;

  const categoryById = new Map(
    (categoriesResult.data || []).map((category) => [String(category.id), category])
  );
  const marketProductIds = new Set(catalog.productIds.map(String));
  const products = (productsResult.data || [])
    .filter((product) => marketProductIds.has(String(product.id)))
    .map((product) => {
      const category = categoryById.get(String(product.category_id)) || null;
      return {
        ...product,
        categoryName: category?.name || "Uncategorised",
        categorySlug: toCategorySlug(category?.slug || category?.name || "uncategorised") || "uncategorised",
        categorySortOrder: Number(category?.sort_order ?? category?.id ?? 9999),
      };
    });
  const productIds = products.map((product) => product.id);

  let variants = [];
  if (productIds.length) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("*")
      .in("product_id", productIds)
      .eq("market_id", catalog.market.id)
      .eq("is_active", true)
      .order("product_id", { ascending: true })
      .order("is_default", { ascending: false })
      .order("id", { ascending: true });
    if (error) throw error;
    variants = data || [];
  }

  const variantIds = variants.map((variant) => variant.id).filter(Boolean);
  const latestHistoryByVariant = new Map();
  if (variantIds.length) {
    const { data, error } = await supabase
      .from("variant_price_history")
      .select("variant_id, changed_at, old_price, new_price")
      .in("variant_id", variantIds)
      .order("changed_at", { ascending: false });
    if (!error) {
      for (const row of data || []) {
        const key = String(row.variant_id);
        if (!latestHistoryByVariant.has(key)) latestHistoryByVariant.set(key, row);
      }
    }
  }

  const variantsByProduct = variants.reduce((acc, variant) => {
    const key = String(variant.product_id);
    if (!acc[key]) acc[key] = [];
    acc[key].push(variant);
    return acc;
  }, {});

  const categoryGroups = new Map();
  for (const product of products) {
    const productVariants = variantsByProduct[String(product.id)] || [];
    const lastChangedTimes = productVariants
      .map((variant) => latestHistoryByVariant.get(String(variant.id))?.changed_at)
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);
    const lastChangedAt = lastChangedTimes.length ? new Date(Math.max(...lastChangedTimes)).toISOString() : null;
    const row = {
      id: product.id,
      name: product.name,
      slug: buildProductSlug(product),
      categorySlug: product.categorySlug,
      lastChangedAt,
      variants: productVariants.map((variant) => {
        const history = latestHistoryByVariant.get(String(variant.id)) || null;
        return {
          id: variant.id,
          productId: product.id,
          label: buildAdminVariantLabel(variant, productVariants),
          price: Number(variant.price),
          currencyCode: variant.currency_code || catalog.market.currencyCode,
          unit: variant.unit || "",
          isDefault: variant.is_default === true,
          lastChangedAt: history?.changed_at || null,
          lastOldPrice: history?.old_price ?? null,
          lastNewPrice: history?.new_price ?? null,
        };
      }),
    };

    const key = product.categorySlug;
    if (!categoryGroups.has(key)) {
      categoryGroups.set(key, {
        slug: product.categorySlug,
        name: product.categoryName,
        sortOrder: product.categorySortOrder,
        products: [],
      });
    }
    categoryGroups.get(key).products.push(row);
  }

  const groups = [...categoryGroups.values()]
    .map((group) => ({
      ...group,
      products: group.products.sort((left, right) => {
        const leftTime = left.lastChangedAt ? new Date(left.lastChangedAt).getTime() : 0;
        const rightTime = right.lastChangedAt ? new Date(right.lastChangedAt).getTime() : 0;
        return leftTime - rightTime || String(left.name).localeCompare(String(right.name));
      }),
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));

  return {
    groups,
    totalProducts: products.length,
    totalVariants: variants.length,
    market: {
      id: catalog.market.id,
      code: catalog.market.code,
      currencyCode: catalog.market.currencyCode,
      locale: catalog.market.locale,
    },
  };
};
