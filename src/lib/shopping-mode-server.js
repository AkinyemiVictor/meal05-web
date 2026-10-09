import "server-only";

import { normalizeShoppingMode, SHOPPING_MODE_BUSINESS } from "@/lib/shopping-mode";

export const getRequestShoppingMode = (request, body) => {
  const bodyMode = body?.shopping_mode ?? body?.shoppingMode;
  if (bodyMode) return normalizeShoppingMode(bodyMode);
  try {
    return normalizeShoppingMode(new URL(request.url).searchParams.get("mode"));
  } catch {
    return "household";
  }
};

export async function resolveVariantForShoppingMode(admin, variant, modeValue) {
  const mode = normalizeShoppingMode(modeValue);
  if (!variant) return { ok: false, error: "Product option not found" };
  const [productResult, variantResult] = await Promise.all([
    admin.from("product_mode_settings").select("is_visible, requires_quote, purchasing_conditions").eq("product_id", variant.product_id).eq("shopping_mode", mode).maybeSingle(),
    admin.from("product_variant_mode_settings").select("price, is_visible, min_quantity, max_quantity, step_quantity, packaging_label, availability_mode, supplier_confirmation_required, direct_checkout_enabled").eq("variant_id", variant.id).eq("shopping_mode", mode).maybeSingle(),
  ]);
  if (productResult.error) throw productResult.error;
  if (variantResult.error) throw variantResult.error;
  const productSetting = productResult.data;
  const setting = variantResult.data;
  if (productSetting?.is_visible === false || setting?.is_visible === false) {
    return { ok: false, error: "This product is not available in the selected shopping mode" };
  }
  const business = mode === SHOPPING_MODE_BUSINESS;
  const configuredPrice = setting?.price == null ? null : Number(setting.price);
  const quoteOnly = business && (
    productSetting?.requires_quote === true ||
    !Number.isFinite(configuredPrice) ||
    setting?.direct_checkout_enabled === false
  );
  return {
    ok: true,
    mode,
    quoteOnly,
    supplierConfirmationRequired: setting?.supplier_confirmation_required === true,
    purchasingConditions: productSetting?.purchasing_conditions || null,
    variant: {
      ...variant,
      price: business ? (Number.isFinite(configuredPrice) ? configuredPrice : 0) : (Number.isFinite(configuredPrice) ? configuredPrice : variant.price),
      min_quantity: setting?.min_quantity ?? variant.min_quantity,
      max_quantity: setting?.max_quantity ?? variant.max_quantity,
      step_quantity: setting?.step_quantity ?? variant.step_quantity,
      availability_mode: setting?.availability_mode || variant.availability_mode,
      packaging_label: setting?.packaging_label || null,
    },
  };
}
