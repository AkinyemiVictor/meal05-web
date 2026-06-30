import { applyMarketListing, loadMarketCatalog } from "@/lib/market-catalog-server";

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
  "drinks-beverages": "fa-mug-hot",
  "cooked-food": "fa-utensils",
  "snacks-pastries": "fa-cookie-bite",
  others: "fa-basket-shopping",
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
    icon: pickFirst(row, ["icon", "icon_class", "iconClass", "fa_icon", "faIcon"]) || CATEGORY_ICON_BY_SLUG[slug] || "fa-basket-shopping",
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
    const catalog = await loadMarketCatalog(supabase);
    const [categoryResult, productResult] = await Promise.all([
      supabase.from("product_categories").select("*"),
      supabase.from("products").select("*"),
    ]);
    if (categoryResult.error) throw categoryResult.error;
    if (productResult.error) throw productResult.error;

    const categoriesById = (Array.isArray(categoryResult.data) ? categoryResult.data : []).reduce((acc, row) => {
      const id = row?.id == null ? "" : String(row.id);
      if (!id) return acc;
      const name = pickFirst(row, ["name", "label", "title", "category_name", "categoryName"]);
      const slug = toCategorySlug(pickFirst(row, ["slug", "category_slug", "categorySlug", "key"]) || name);
      if (slug) acc[id] = slug;
      return acc;
    }, {});

    const products = (Array.isArray(productResult.data) ? productResult.data : [])
      .filter(isActiveRow)
      .map((row) => applyMarketListing(row, catalog))
      .filter(Boolean);
    const productIds = products.map((row) => row?.id ?? row?.product_id).filter(Boolean);
    let variantRows = [];
    if (productIds.length) {
      const { data: variants, error: variantsError } = await supabase
        .from("product_variants")
        .select("*")
        .in("product_id", productIds)
        .eq("market_id", catalog.market.id);
      if (!variantsError && Array.isArray(variants)) {
        variantRows = variants.filter(isActiveRow);
      }
    }

    const variantsByProduct = variantRows.reduce((acc, row) => {
      const productId = row?.product_id == null ? "" : String(row.product_id);
      if (!productId) return acc;
      if (!acc[productId]) acc[productId] = [];
      acc[productId].push(row);
      return acc;
    }, {});

    return products.reduce((acc, row) => {
      if (row?.is_active === false) return acc;
      const categoryId = row?.category_id ?? row?.categoryId ?? row?.product_category_id ?? row?.productCategoryId;
      const slug =
        categoriesById[String(categoryId ?? "")] ||
        toCategorySlug(row?.category_slug || row?.categorySlug || row?.category_name || row?.category || "uncategorised") ||
        "uncategorised";
      if (!acc[slug]) acc[slug] = { product_count: 0, available_product_count: 0 };
      acc[slug].product_count += 1;

      const variants = variantsByProduct[String(row?.id ?? row?.product_id)] || [];
      const stockSources = variants.length ? variants : [row];
      const isAvailable = stockSources.some((entry) => {
        const stock = entry?.stock_count ?? entry?.stockCount ?? entry?.inventory_count ?? entry?.quantity ?? entry?.stock;
        if (stock == null || stock === "") return true;
        const count = Number(stock);
        return Number.isFinite(count) ? count > 0 : !String(stock).toLowerCase().includes("out");
      });
      if (isAvailable) acc[slug].available_product_count += 1;
      return acc;
    }, {});
  } catch {
    return {};
  }
};

export const mapCategoryRows = (rows, counts = {}) =>
  (Array.isArray(rows) ? rows : [])
    .filter(isActiveRow)
    .map((row, index) => mapCategoryRow(row, index, counts))
    .sort((a, b) => a.sortOrder - b.sortOrder);
