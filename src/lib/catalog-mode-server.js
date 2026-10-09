import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { normalizeShoppingMode, SHOPPING_MODE_BUSINESS } from "@/lib/shopping-mode";

const asNumber = (value) => {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const groupProducts = (products = []) => products.reduce((groups, product) => {
  const key = product?.categorySlug || "uncategorised";
  if (!groups[key]) groups[key] = [];
  groups[key].push(product);
  return groups;
}, {});

const applyVariant = (variant, setting, mode, productRequiresQuote = false) => {
  if (!variant || variant?.is_visible === false || setting?.is_visible === false) return null;
  const business = mode === SHOPPING_MODE_BUSINESS;
  const configuredPrice = asNumber(setting?.price);
  const basePrice = asNumber(variant?.price) ?? 0;
  const price = business ? (configuredPrice ?? 0) : (configuredPrice ?? basePrice);
  const quoteOnly = business && (
    productRequiresQuote ||
    configuredPrice == null ||
    setting?.direct_checkout_enabled === false
  );
  const minQuantity = asNumber(setting?.min_quantity) ?? asNumber(variant?.minQuantity ?? variant?.min_quantity);
  const maxQuantity = asNumber(setting?.max_quantity) ?? asNumber(variant?.maxQuantity ?? variant?.max_quantity);
  const stepQuantity = asNumber(setting?.step_quantity) ?? asNumber(variant?.stepQuantity ?? variant?.step_quantity);
  const availabilityMode = setting?.availability_mode || variant?.availabilityMode || variant?.availability_mode || "standard";
  const packagingLabel = String(setting?.packaging_label || "").trim();
  return {
    ...variant,
    price,
    oldPrice: business ? price : variant?.oldPrice,
    minQuantity,
    min_quantity: minQuantity,
    maxQuantity,
    max_quantity: maxQuantity,
    stepQuantity,
    step_quantity: stepQuantity,
    availabilityMode,
    availability_mode: availabilityMode,
    packagingLabel: packagingLabel || variant?.packagingLabel,
    quoteOnly,
    requiresQuote: quoteOnly,
    supplierConfirmationRequired: setting?.supplier_confirmation_required === true,
    directCheckoutEnabled: !quoteOnly,
    shoppingMode: mode,
  };
};

export async function applyShoppingModeToCatalogPayload(payload, requestedMode, client) {
  const mode = normalizeShoppingMode(requestedMode);
  const source = payload && typeof payload === "object" ? payload : {};
  const flat = Array.isArray(source.flat)
    ? source.flat
    : source.product
      ? [{ ...source.product, variations: Array.isArray(source.variations) ? source.variations : source.product.variations }]
      : [];
  if (!flat.length) return source;

  const admin = client || getSupabaseAdminClient();
  const productIds = [...new Set(flat.map((product) => String(product?.id || product?.productId || "")).filter(Boolean))];
  const variantIds = [...new Set(flat.flatMap((product) => [
    product?.variantId,
    product?.variant_id,
    ...(Array.isArray(product?.variations) ? product.variations.map((variant) => variant?.variationId || variant?.variantId || variant?.id) : []),
  ]).map((id) => String(id || "")).filter(Boolean))];

  const [productResult, variantResult] = await Promise.all([
    admin.from("product_mode_settings").select("product_id, is_visible, requires_quote, purchasing_conditions").eq("shopping_mode", mode).in("product_id", productIds),
    variantIds.length
      ? admin.from("product_variant_mode_settings").select("variant_id, price, is_visible, min_quantity, max_quantity, step_quantity, packaging_label, availability_mode, supplier_confirmation_required, direct_checkout_enabled").eq("shopping_mode", mode).in("variant_id", variantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productResult.error) throw productResult.error;
  if (variantResult.error) throw variantResult.error;

  const productSettings = new Map((productResult.data || []).map((row) => [String(row.product_id), row]));
  const variantSettings = new Map((variantResult.data || []).map((row) => [String(row.variant_id), row]));
  const mapped = flat.flatMap((product) => {
    const productId = String(product?.id || product?.productId || "");
    const productSetting = productSettings.get(productId);
    if (productSetting?.is_visible === false) return [];
    const productRequiresQuote = productSetting?.requires_quote === true;
    const originalVariations = Array.isArray(product?.variations) ? product.variations : [];
    const variations = originalVariations
      .map((variant) => applyVariant(
        variant,
        variantSettings.get(String(variant?.variationId || variant?.variantId || variant?.id || "")),
        mode,
        productRequiresQuote
      ))
      .filter(Boolean);
    const cardVariantId = String(product?.variantId || product?.variant_id || "");
    let card = applyVariant(product, variantSettings.get(cardVariantId), mode, productRequiresQuote);
    if (!card) return [];
    if (mode === SHOPPING_MODE_BUSINESS && variations.length) {
      const preferred = variations.find((variant) => !variant.quoteOnly && variant.is_default) ||
        variations.filter((variant) => !variant.quoteOnly).sort((a, b) => Number(a.price) - Number(b.price))[0] ||
        variations.find((variant) => variant.is_default) || variations[0];
      if (preferred) {
        card = {
          ...card,
          variantId: String(preferred.variationId || preferred.variantId || preferred.id || card.variantId),
          variantName: preferred.name || card.variantName,
          price: preferred.price,
          oldPrice: preferred.price,
          quoteOnly: preferred.quoteOnly,
          requiresQuote: preferred.requiresQuote,
          supplierConfirmationRequired: preferred.supplierConfirmationRequired,
          minQuantity: preferred.minQuantity,
          min_quantity: preferred.min_quantity,
          maxQuantity: preferred.maxQuantity,
          max_quantity: preferred.max_quantity,
          stepQuantity: preferred.stepQuantity,
          step_quantity: preferred.step_quantity,
        };
      }
    }
    return [{
      ...card,
      variations,
      purchasingConditions: productSetting?.purchasing_conditions || null,
      shoppingMode: mode,
    }];
  });

  if (source.product) {
    const product = mapped[0] || null;
    return { ...source, product, variations: product?.variations || [], defaultVariantId: product?.variantId || source.defaultVariantId };
  }
  return { ...source, flat: mapped, grouped: groupProducts(mapped) };
}
