import { getDefaultMarket } from "@/lib/market-server";
import { countDistinctCatalogProductsByCategory } from "@/lib/catalog-pagination";

export { countDistinctCatalogProductsByCategory } from "@/lib/catalog-pagination";

export const toCategorySlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const isActiveRow = (row) => row?.is_active !== false && row?.active !== false && row?.isActive !== false;

const CATEGORY_ICON_BY_SLUG = {
  "meat-poultry": "fa-drumstick-bite",
  "fish-seafood": "fa-fish",
  vegetables: "fa-carrot",
  fruits: "fa-apple-whole",
  "grains-cereals": "fa-wheat-awn",
  "dairy-eggs": "fa-cheese",
  "tubers-legumes": "fa-seedling",
  "spices-condiments": "fa-mortar-pestle",
  "oil-cooking-essentials": "fa-oil-can",
  "pantry-processed-foods": "fa-kitchen-set",
  "drinks-beverages": "fa-mug-hot",
  "cooked-food": "fa-utensils",
  "snacks-pastries": "fa-cookie-bite",
  others: "fa-basket-shopping",
};

const CATEGORY_ORDER = [
  "meat-poultry",
  "fish-seafood",
  "vegetables",
  "fruits",
  "grains-cereals",
  "dairy-eggs",
  "tubers-legumes",
  "spices-condiments",
  "oil-cooking-essentials",
  "drinks-beverages",
  "cooked-food",
  "snacks-pastries",
  "pantry-processed-foods",
  "others",
];

const CATEGORY_ORDER_INDEX = CATEGORY_ORDER.reduce((acc, slug, index) => {
  acc[slug] = index;
  return acc;
}, {});

const resolveCategoryIcon = (row, slug) => {
  if (slug === "pantry-processed-foods") return CATEGORY_ICON_BY_SLUG[slug];
  return pickFirst(row, ["icon", "icon_class", "iconClass", "fa_icon", "faIcon"]) || CATEGORY_ICON_BY_SLUG[slug] || "fa-basket-shopping";
};

const pickFirst = (row, keys) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && value !== "") return value;
  }
  return "";
};

export const mapCategoryRow = (row, index, counts = {}) => {
  const label = pickFirst(row, ["name", "label", "title", "category_name", "categoryName"]) || "Category";
  const rawSlug = pickFirst(row, ["slug", "category_slug", "categorySlug", "key"]) || label;
  const slug = toCategorySlug(rawSlug || label);
  const countData = counts[slug] || {};
  const productCount = typeof countData === "number" ? countData : countData.product_count ?? 0;
  const availableProductCount =
    typeof countData === "number" ? countData : countData.available_product_count ?? productCount;

  return {
    id: row?.id ?? slug,
    name: label,
    slug,
    productKey: pickFirst(row, ["product_key", "productKey"]) || slug,
    label,
    icon: resolveCategoryIcon(row, slug),
    description: pickFirst(row, ["description", "summary", "subtitle"]),
    image_url: pickFirst(row, ["image_url", "imageUrl", "image", "thumbnail_url", "thumbnailUrl"]),
    product_count: productCount,
    available_product_count: availableProductCount,
    count: availableProductCount,
    sortOrder: Number(row?.sort_order ?? row?.sortOrder ?? row?.position ?? row?.id ?? index),
  };
};

export const loadCategoryRows = async (supabase) => {
  const { data, error } = await supabase.from("product_categories").select("*").order("id", { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

export const loadCategoryCounts = async (supabase) => {
  try {
    const market = await getDefaultMarket();
    const rows = [];
    const batchSize = 1000;
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from("product_card_catalog")
        .select("product_id, category_slug, in_stock")
        .eq("market_id", market.id)
        .order("product_id", { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (error) throw error;

      const batch = Array.isArray(data) ? data : [];
      rows.push(...batch);
      if (batch.length < batchSize) break;
      offset += batchSize;
    }

    return countDistinctCatalogProductsByCategory(rows);
  } catch {
    return {};
  }
};

export const mapCategoryRows = (rows, counts = {}) =>
  (Array.isArray(rows) ? rows : [])
    .filter(isActiveRow)
    .map((row, index) => mapCategoryRow(row, index, counts))
    .sort((a, b) => {
      const aOrder = CATEGORY_ORDER_INDEX[a.slug] ?? Number.POSITIVE_INFINITY;
      const bOrder = CATEGORY_ORDER_INDEX[b.slug] ?? Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.sortOrder - b.sortOrder;
    });
