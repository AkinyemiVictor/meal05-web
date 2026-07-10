const DEFAULT_PACKAGING_FEE_TIERS = [
  { maxPackableItems: 5, fee: 200 },
  { maxPackableItems: 12, fee: 350 },
  { maxPackableItems: Number.POSITIVE_INFINITY, fee: 500 },
];

const HANDLED_PACKAGING_KEYWORDS = [
  "handled",
  "loose",
  "crate",
  "bulk",
  "unpacked",
  "transport",
];

const PACKAGED_PACKAGING_KEYWORDS = [
  "packaged",
  "packed",
  "bag",
  "mesh",
  "nylon",
  "wrapped",
  "portion",
];

const HANDLED_ITEM_KEYWORDS = [
  "yam",
  "plantain",
  "banana bunch",
  "watermelon",
  "water melon",
  "melon",
  "cocoyam",
  "cassava",
  "pumpkin",
  "sweet potato",
  "irish potato",
  "soursop",
  "breadfruit",
];

const HANDLED_CATEGORY_SLUGS = new Set([
  "tubers-legumes",
]);

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundMoney = (value) => Math.max(0, Math.round(toNumber(value, 0)));

const normaliseText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const includesAny = (text, keywords) => keywords.some((keyword) => text.includes(keyword));

const getQuantity = (item) => {
  if (!item || typeof item !== "object") return 0;

  const orderSize = toNumber(item.orderSize, 0);
  const orderCount = toNumber(item.orderCount, 0);
  if (orderSize > 0 && orderCount > 0) {
    return Math.max(0, Math.round(orderSize * orderCount));
  }

  const quantity = toNumber(item.quantity ?? item.qty, 0);
  if (quantity > 0) return Math.max(0, Math.round(quantity));

  if (orderCount > 0) return Math.max(0, Math.round(orderCount));
  return 0;
};

const readExplicitMode = (item) => {
  if (!item || typeof item !== "object") return "";

  if (item.isHandled === true) return "handled";
  if (item.isPackaged === true || item.isPackable === true) return "packaged";

  const candidates = [
    item.packagingMode,
    item.packaging_mode,
    item.packagingClass,
    item.packaging_class,
    item.packagingType,
    item.packaging_type,
    item.handlingType,
    item.handling_type,
    item.packaging,
    item.packagingMaterialType,
    item.packaging_material_type,
  ];

  for (const candidate of candidates) {
    const text = normaliseText(candidate);
    if (!text) continue;
    if (includesAny(text, HANDLED_PACKAGING_KEYWORDS)) return "handled";
    if (includesAny(text, PACKAGED_PACKAGING_KEYWORDS)) return "packaged";
  }

  return "";
};

export const inferPackagingMode = (item) => {
  const explicitMode = readExplicitMode(item);
  if (explicitMode) return explicitMode;

  const categorySlug = normaliseText(item?.categorySlug || item?.category_slug);
  if (categorySlug && HANDLED_CATEGORY_SLUGS.has(categorySlug)) {
    const combinedName = normaliseText([item?.name, item?.productName, item?.product_name].filter(Boolean).join(" "));
    if (combinedName && includesAny(combinedName, HANDLED_ITEM_KEYWORDS)) {
      return "handled";
    }
  }

  const combined = normaliseText(
    [
      item?.name,
      item?.productName,
      item?.product_name,
      item?.variantName,
      item?.variant_name,
      item?.unit,
      item?.category,
      item?.categorySlug,
      item?.category_slug,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (combined && includesAny(combined, HANDLED_ITEM_KEYWORDS)) {
    return "handled";
  }

  return "packaged";
};

export const countPackableItems = (items) =>
  (Array.isArray(items) ? items : []).reduce((total, item) => {
    if (inferPackagingMode(item) === "handled") return total;
    return total + getQuantity(item);
  }, 0);

export const buildPackagingMetadata = (item) => {
  const packagingMode = inferPackagingMode(item);
  return {
    packagingMode,
    isHandled: packagingMode === "handled",
    isPackable: packagingMode !== "handled",
  };
};

export const computePackagingFee = (items, { tiers = DEFAULT_PACKAGING_FEE_TIERS } = {}) => {
  const packableItemsCount = countPackableItems(items);
  if (packableItemsCount <= 0) {
    return {
      packableItemsCount: 0,
      packagingFee: 0,
    };
  }

  const safeTiers = Array.isArray(tiers) && tiers.length ? tiers : DEFAULT_PACKAGING_FEE_TIERS;
  const tier =
    safeTiers.find((entry) => packableItemsCount <= Number(entry?.maxPackableItems ?? 0)) ||
    safeTiers[safeTiers.length - 1];

  return {
    packableItemsCount,
    packagingFee: roundMoney(tier?.fee),
  };
};

export { DEFAULT_PACKAGING_FEE_TIERS };
