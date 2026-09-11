import "server-only";

const previewEnabled = () =>
  process.env.FIXED_MEAT_OPTIONS_PREVIEW === "1" && process.env.NODE_ENV !== "production";

const TARGETS = {
  chicken: {
    ids: new Set(["226"]),
    names: new Set(["frozen broiler chicken", "frozen chicken - broiler", "chicken"]),
    displayName: null,
    prices: [2750, 5500, 11688, 23375, 46750],
  },
  beef: {
    ids: new Set(["204"]),
    names: new Set(["cow meat assorted", "beef bone-in cuts"]),
    displayName: "Beef Bone-in Cuts",
    prices: [3750, 7500, 15938, 31875, 63750],
  },
};

const OPTIONS = [
  { name: "500g", unit: "pack", size: "500g", baseQuantity: 0.5 },
  { name: "1kg", unit: "pack", size: "1kg", baseQuantity: 1 },
  { name: "Quarter Carton (2–2.25kg)", unit: "carton", size: "2–2.25kg", weightMin: 2, weightMax: 2.25 },
  { name: "Half Carton (4–4.5kg)", unit: "carton", size: "4–4.5kg", weightMin: 4, weightMax: 4.5 },
  { name: "1 Carton (8–9kg)", unit: "carton", size: "8–9kg", weightMin: 8, weightMax: 9 },
];

const targetFor = (product) => {
  const id = String(product?.id ?? product?.productId ?? product?.product_id ?? "");
  const name = String(product?.name || "").trim().toLowerCase();
  return Object.entries(TARGETS).find(([, target]) => target.ids.has(id) || target.names.has(name)) || null;
};

const availableStock = (product) => {
  const candidates = [
    product?.stock,
    ...(Array.isArray(product?.variations)
      ? product.variations.flatMap((variant) => [variant?.stock, variant?.stockCount, variant?.stock_count])
      : []),
  ].map(Number).filter(Number.isFinite);
  return candidates.length ? Math.max(0, ...candidates) : 0;
};

const buildVariations = (key, target, product) => {
  const stock = availableStock(product);
  const image = product?.image || product?.mainImageUrl || product?.main_image_url;
  return OPTIONS.map((option, index) => {
    const variationId = `preview-${key}-${index + 1}`;
    const baseQuantity = option.baseQuantity ?? null;
    const weightMin = option.weightMin ?? null;
    const weightMax = option.weightMax ?? null;
    return {
      variationId,
      variantId: variationId,
      id: variationId,
      name: option.name,
      displayLabel: option.name,
      display_label: option.name,
      size: option.size,
      sizeLabel: option.name,
      unit: option.unit,
      price: target.prices[index],
      oldPrice: null,
      currencyCode: "NGN",
      purchaseMode: "fixed",
      purchase_mode: "fixed",
      minQuantity: 1,
      min_quantity: 1,
      maxQuantity: null,
      max_quantity: null,
      stepQuantity: 1,
      step_quantity: 1,
      baseUnit: "kg",
      base_unit: "kg",
      baseQuantity,
      base_quantity: baseQuantity,
      weightMin,
      weight_min: weightMin,
      weightMax,
      weight_max: weightMax,
      weightUnit: weightMin == null ? null : "kg",
      weight_unit: weightMin == null ? null : "kg",
      optionRole: "standard",
      option_role: "standard",
      availabilityMode: "standard",
      availability_mode: "standard",
      inventoryTrackingMode: "tracked",
      inventory_tracking_mode: "tracked",
      stock,
      stockCount: stock,
      is_default: index === 0,
      isSelectable: stock > 0,
      image,
      category: product?.category,
      categorySlug: product?.categorySlug,
      preview: true,
    };
  });
};

export const applyFixedMeatOptionsPreview = (product) => {
  if (!previewEnabled() || !product) return product;
  const match = targetFor(product);
  if (!match) return product;
  const [key, target] = match;
  const variations = buildVariations(key, target, product);
  const defaultVariation = variations[0];
  return {
    ...product,
    ...(target.displayName ? { name: target.displayName } : {}),
    variantId: defaultVariation.variationId,
    variantName: defaultVariation.name,
    price: defaultVariation.price,
    oldPrice: defaultVariation.price,
    unit: defaultVariation.unit,
    stock: defaultVariation.stock,
    variantCount: variations.length,
    hasMultipleOptions: true,
    variations,
    optionsLoaded: true,
    purchaseMode: "fixed",
    purchase_mode: "fixed",
    selectionModel: "exact_variant",
    selection_model: "exact_variant",
    tagBatch: null,
    procurementMode: "standard",
    procurement_mode: "standard",
    fixedMeatOptionsPreview: true,
  };
};

export const applyFixedMeatOptionsPreviewPayload = (payload) => {
  if (!previewEnabled() || !payload || typeof payload !== "object") return payload;
  const grouped = payload.grouped && typeof payload.grouped === "object"
    ? Object.fromEntries(
        Object.entries(payload.grouped).map(([key, products]) => [
          key,
          Array.isArray(products) ? products.map(applyFixedMeatOptionsPreview) : products,
        ])
      )
    : payload.grouped;
  const flat = Array.isArray(payload.flat) ? payload.flat.map(applyFixedMeatOptionsPreview) : payload.flat;
  const items = Array.isArray(payload.items) ? payload.items.map(applyFixedMeatOptionsPreview) : payload.items;
  return { ...payload, ...(grouped ? { grouped } : {}), ...(flat ? { flat } : {}), ...(items ? { items } : {}) };
};

