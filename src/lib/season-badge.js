const normalize = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_/-]+/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const containsAny = (value, terms) => terms.some((term) => value.includes(term));

const NON_SEASONAL_CATEGORY_TERMS = [
  "dairy eggs",
  "drink beverage",
  "drinks beverages",
  "fish seafood",
  "meat poultry",
  "oil cooking essentials",
  "pantry processed foods",
  "snacks pastries",
  "spices condiments",
  "cooked food",
  "others",
];

const SEASONAL_CATEGORY_TERMS = [
  "fruit",
  "vegetable",
  "tuber legume",
  "tubers legumes",
];

const SEASONAL_GRAIN_TERMS = [
  "beans",
  "corn",
  "maize",
  "millet",
  "rice",
  "sorghum",
  "guinea corn",
];

const YEAR_ROUND_PRODUCT_TERMS = [
  "beef",
  "chicken",
  "egg",
  "fish",
  "garri",
  "gari",
  "goat meat",
  "meat",
  "palm oil",
  "pork",
  "snail",
  "stockfish",
  "turkey",
];

const BRANDED_OR_PROCESSED_TERMS = [
  "bama",
  "cereal",
  "corn flakes",
  "dangote",
  "golden penny",
  "indomie",
  "knorr",
  "macaroni",
  "maggi",
  "noodles",
  "oats",
  "pasta",
  "power oil",
  "sardine",
  "seasoning cube",
  "spaghetti",
  "terra",
  "tomato paste",
];

const explicitBrandValue = (product = {}) =>
  product.brand ||
  product.brandName ||
  product.brand_name ||
  product.manufacturer ||
  product.manufacturerName ||
  product.manufacturer_name;

export const shouldShowSeasonBadge = (product = {}) => {
  if (!product || typeof product !== "object") return false;
  if (product.showSeasonBadge === false || product.seasonalBadge === false || product.isSeasonal === false) return false;
  if (product.isBranded === true || product.branded === true || explicitBrandValue(product)) return false;

  const name = normalize(product.name);
  const category = normalize(
    [
      product.categorySlug,
      product.category_slug,
      product.categoryKey,
      product.category_key,
      product.category,
      product.categoryName,
      product.category_name,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (containsAny(category, NON_SEASONAL_CATEGORY_TERMS)) return false;
  if (containsAny(name, YEAR_ROUND_PRODUCT_TERMS)) return false;
  if (containsAny(name, BRANDED_OR_PROCESSED_TERMS)) return false;
  if (containsAny(category, SEASONAL_CATEGORY_TERMS)) return true;

  const isGrainCategory = category.includes("grain") || category.includes("cereal");
  if (isGrainCategory && containsAny(name, SEASONAL_GRAIN_TERMS)) return true;

  return false;
};
