import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminAccess } from "@/lib/admin-access";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { logAdminEvent, logAdminError } from "@/lib/api/log";
import { respondZodError } from "@/lib/api/validate";
import { normalizePromoEnabled, normalizePromoText, parsePromoExpiry } from "@/lib/product-promo";
import { PURCHASE_MODE_FIXED, PURCHASE_MODE_LOOSE, normalizePurchaseMode, roundQuantity } from "@/lib/purchase-quantities";
import { revalidatePublicCatalog } from "@/lib/catalog-cache-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toId = (value) => {
  const num = Number(String(value || "").trim());
  return Number.isSafeInteger(num) && num > 0 ? num : null;
};

const normalizeNullableText = (value, { max = 500 } = {}) => {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
};

const toPositiveNullableNumber = (value) => {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? roundQuantity(num) : null;
};

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:products:update", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  }

  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr) {
    await logAdminError(authErr, { route: "/api/admin/products/update", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  }
  if (!user) {
    await logAdminError("Not authenticated", { route: "/api/admin/products/update", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    await logAdminError("Forbidden admin attempt", { route: "/api/admin/products/update", actor: user.email });
    return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), rl);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl);
  }

  const schema = z.object({
    product_id: z.union([z.string(), z.number()]),
    variant_id: z.union([z.string(), z.number()]).optional(),
    in_season: z.boolean().optional(),
    is_active: z.boolean().optional(),
    category_id: z.union([z.string(), z.number(), z.null()]).optional(),
    image_url: z.union([z.string().trim().max(500), z.null()]).optional(),
    is_bundle_eligible: z.boolean().optional(),
    variant_is_active: z.boolean().optional(),
    selection_model: z.enum(["exact_variant", "flexible_market"]).optional(),
    variation_note: z.union([z.string().trim().max(500), z.null()]).optional(),
    availability_mode: z.enum(["standard", "request", "unavailable"]).optional(),
    inventory_tracking_mode: z.enum(["tracked", "supplier"]).optional(),
    option_role: z.enum(["standard", "volume_saver", "manufacturer_pack", "size", "ripeness", "grade", "form", "value_tier"]).nullable().optional(),
    purchase_mode: z.enum([PURCHASE_MODE_FIXED, PURCHASE_MODE_LOOSE]).optional(),
    min_quantity: z.union([z.number().positive().max(9999), z.null()]).optional(),
    max_quantity: z.union([z.number().positive().max(9999), z.null()]).optional(),
    step_quantity: z.union([z.number().positive().max(9999), z.null()]).optional(),
    base_unit: z.union([z.string().trim().max(40), z.null()]).optional(),
    base_quantity: z.union([z.number().positive().max(9999), z.null()]).optional(),
    promo_tag_text: z.union([z.string().trim().max(80), z.null()]).optional(),
    promo_tag_expires_at: z.union([z.string().trim().max(80), z.null()]).optional(),
    promo_tag_enabled: z.boolean().optional(),
    note: z.string().trim().max(500).optional(),
  }).strict();
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    await logAdminError("Validation failed", { route: "/api/admin/products/update", issues: parsed.error.issues });
    return applyRateLimitHeaders(respondZodError(parsed.error), rl);
  }

  const productId = toId(parsed.data.product_id);
  const variantId = toId(parsed.data.variant_id);
  if (!productId) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid product id" }, { status: 400 }), rl);
  }
  const admin = getSupabaseAdminClient();
  const hasSeason = typeof parsed.data.in_season === "boolean";
  const hasProductActive = typeof parsed.data.is_active === "boolean";
  const hasCategory = Object.prototype.hasOwnProperty.call(parsed.data, "category_id");
  const hasImageUrl = Object.prototype.hasOwnProperty.call(parsed.data, "image_url");
  const hasBundleEligible = typeof parsed.data.is_bundle_eligible === "boolean";
  const hasVariantActive = typeof parsed.data.variant_is_active === "boolean";
  const hasSelectionModel = Object.hasOwn(parsed.data, "selection_model");
  const hasVariationNote = Object.hasOwn(parsed.data, "variation_note");
  const hasAvailabilityMode = Object.hasOwn(parsed.data, "availability_mode");
  const hasInventoryTrackingMode = Object.hasOwn(parsed.data, "inventory_tracking_mode");
  const hasOptionRole = Object.hasOwn(parsed.data, "option_role");
  const hasPurchaseMode = Object.prototype.hasOwnProperty.call(parsed.data, "purchase_mode");
  const hasMinQuantity = Object.prototype.hasOwnProperty.call(parsed.data, "min_quantity");
  const hasMaxQuantity = Object.prototype.hasOwnProperty.call(parsed.data, "max_quantity");
  const hasStepQuantity = Object.prototype.hasOwnProperty.call(parsed.data, "step_quantity");
  const hasBaseUnit = Object.prototype.hasOwnProperty.call(parsed.data, "base_unit");
  const hasBaseQuantity = Object.prototype.hasOwnProperty.call(parsed.data, "base_quantity");
  const hasPromoText = Object.prototype.hasOwnProperty.call(parsed.data, "promo_tag_text");
  const hasPromoExpiry = Object.prototype.hasOwnProperty.call(parsed.data, "promo_tag_expires_at");
  const hasPromoEnabled = Object.prototype.hasOwnProperty.call(parsed.data, "promo_tag_enabled");
  if (
    !hasSeason &&
    !hasProductActive &&
    !hasCategory &&
    !hasImageUrl &&
    !hasBundleEligible &&
    !hasVariantActive &&
    !hasSelectionModel &&
    !hasVariationNote &&
    !hasAvailabilityMode &&
    !hasInventoryTrackingMode &&
    !hasOptionRole &&
    !hasPurchaseMode &&
    !hasMinQuantity &&
    !hasMaxQuantity &&
    !hasStepQuantity &&
    !hasBaseUnit &&
    !hasBaseQuantity &&
    !hasPromoText &&
    !hasPromoExpiry &&
    !hasPromoEnabled
  ) {
    return applyRateLimitHeaders(NextResponse.json({ error: "No update fields provided" }, { status: 400 }), rl);
  }
  if (
    (hasVariantActive ||
      hasPurchaseMode || hasAvailabilityMode || hasInventoryTrackingMode || hasOptionRole ||
      hasMinQuantity ||
      hasMaxQuantity ||
      hasStepQuantity ||
      hasBaseUnit ||
      hasBaseQuantity) &&
    !variantId
  ) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid variant id" }, { status: 400 }), rl);
  }
  const nextCategoryId = hasCategory ? toId(parsed.data.category_id) : null;
  if (hasCategory && !nextCategoryId) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid category id" }, { status: 400 }), rl);
  }
  const nextImageUrl = hasImageUrl ? normalizeNullableText(parsed.data.image_url, { max: 500 }) : null;

  const normalizedPromoTextInput = hasPromoText ? normalizePromoText(parsed.data.promo_tag_text) : null;
  const normalizedPromoExpiryInput = hasPromoExpiry ? parsePromoExpiry(parsed.data.promo_tag_expires_at) : null;
  if (hasPromoExpiry && parsed.data.promo_tag_expires_at != null && !normalizedPromoExpiryInput) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid promo expiry time" }, { status: 400 }), rl);
  }
  const nextPurchaseMode = hasPurchaseMode ? normalizePurchaseMode(parsed.data.purchase_mode) : null;
  const nextMinQuantity = hasMinQuantity ? toPositiveNullableNumber(parsed.data.min_quantity) : null;
  const nextMaxQuantity = hasMaxQuantity ? toPositiveNullableNumber(parsed.data.max_quantity) : null;
  const nextStepQuantity = hasStepQuantity ? toPositiveNullableNumber(parsed.data.step_quantity) : null;
  const nextBaseUnit = hasBaseUnit ? normalizeNullableText(parsed.data.base_unit, { max: 40 }) : null;
  const nextBaseQuantity = hasBaseQuantity ? toPositiveNullableNumber(parsed.data.base_quantity) : null;
  if (hasMinQuantity && parsed.data.min_quantity != null && nextMinQuantity == null) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Minimum quantity must be greater than 0." }, { status: 400 }), rl);
  }
  if (hasMaxQuantity && parsed.data.max_quantity != null && nextMaxQuantity == null) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Maximum quantity must be greater than 0." }, { status: 400 }), rl);
  }
  if (hasStepQuantity && parsed.data.step_quantity != null && nextStepQuantity == null) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Step quantity must be greater than 0." }, { status: 400 }), rl);
  }
  if (hasBaseQuantity && parsed.data.base_quantity != null && nextBaseQuantity == null) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Base quantity must be greater than 0." }, { status: 400 }), rl);
  }

  const [productRes, variantRes] = await Promise.all([
    admin
      .from("products")
      .select("id, name, in_season, is_active, category_id, image_url, is_bundle_eligible, promo_tag_text, promo_tag_expires_at, promo_tag_enabled, selection_model, variation_note")
      .eq("id", productId)
      .maybeSingle(),
    variantId
      ? admin
          .from("product_variants")
          .select("id, product_id, name, price, old_price, stock_count, is_active, purchase_mode, min_quantity, max_quantity, step_quantity, base_unit, base_quantity, availability_mode, inventory_tracking_mode, option_role")
          .eq("id", variantId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (productRes.error) {
    await logAdminError(productRes.error, { route: "/api/admin/products/update", actor: user.email, product_id: productId });
    return applyRateLimitHeaders(NextResponse.json({ error: productRes.error.message }, { status: 400 }), rl);
  }
  if (variantRes.error) {
    await logAdminError(variantRes.error, { route: "/api/admin/products/update", actor: user.email, variant_id: variantId });
    return applyRateLimitHeaders(NextResponse.json({ error: variantRes.error.message }, { status: 400 }), rl);
  }

  const existingProduct = productRes.data;
  const existingVariant = variantRes.data;
  if (!existingProduct) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Product not found" }, { status: 404 }), rl);
  }
  if (variantId && !existingVariant) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Variant not found" }, { status: 404 }), rl);
  }
  if (existingVariant && Number(existingVariant.product_id) !== productId) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Variant does not belong to the selected product" }, { status: 409 }),
      rl
    );
  }
  const effectiveMinQuantity = hasMinQuantity ? nextMinQuantity : toPositiveNullableNumber(existingVariant?.min_quantity);
  const effectiveMaxQuantity = hasMaxQuantity ? nextMaxQuantity : toPositiveNullableNumber(existingVariant?.max_quantity);
  if (effectiveMinQuantity != null && effectiveMaxQuantity != null && effectiveMinQuantity > effectiveMaxQuantity) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Minimum quantity cannot be greater than maximum quantity." }, { status: 400 }),
      rl
    );
  }
  if (hasCategory) {
    const categoryRes = await admin.from("product_categories").select("id").eq("id", nextCategoryId).maybeSingle();
    if (categoryRes.error) {
      await logAdminError(categoryRes.error, {
        route: "/api/admin/products/update",
        actor: user.email,
        product_id: productId,
        category_id: nextCategoryId,
        stage: "category-validate",
      });
      return applyRateLimitHeaders(NextResponse.json({ error: categoryRes.error.message }, { status: 400 }), rl);
    }
    if (!categoryRes.data) {
      return applyRateLimitHeaders(NextResponse.json({ error: "Category not found" }, { status: 404 }), rl);
    }
  }

  const productPatch = {};
  if (hasSeason && existingProduct.in_season !== parsed.data.in_season) {
    productPatch.in_season = parsed.data.in_season;
  }
  if (hasProductActive && existingProduct.is_active !== parsed.data.is_active) {
    productPatch.is_active = parsed.data.is_active;
  }
  if (hasCategory && Number(existingProduct.category_id) !== nextCategoryId) {
    productPatch.category_id = nextCategoryId;
  }
  if (hasImageUrl && normalizeNullableText(existingProduct.image_url, { max: 500 }) !== nextImageUrl) {
    productPatch.image_url = nextImageUrl;
  }
  if (hasBundleEligible && existingProduct.is_bundle_eligible !== parsed.data.is_bundle_eligible) {
    productPatch.is_bundle_eligible = parsed.data.is_bundle_eligible;
  }
  if (hasSelectionModel && existingProduct.selection_model !== parsed.data.selection_model) productPatch.selection_model = parsed.data.selection_model;
  if (hasVariationNote && normalizeNullableText(existingProduct.variation_note) !== normalizeNullableText(parsed.data.variation_note)) {
    productPatch.variation_note = normalizeNullableText(parsed.data.variation_note);
  }
  const currentPromoText = normalizePromoText(existingProduct.promo_tag_text);
  const currentPromoExpiry = parsePromoExpiry(existingProduct.promo_tag_expires_at);
  const currentPromoEnabled = normalizePromoEnabled(existingProduct.promo_tag_enabled);
  const desiredPromoText = hasPromoText ? normalizedPromoTextInput : currentPromoText;
  const desiredPromoExpiryRaw = hasPromoExpiry ? normalizedPromoExpiryInput : currentPromoExpiry;
  const requestedPromoEnabled = hasPromoEnabled ? normalizePromoEnabled(parsed.data.promo_tag_enabled) : currentPromoEnabled;
  const desiredPromoEnabled = desiredPromoText ? requestedPromoEnabled : false;
  if (requestedPromoEnabled && !desiredPromoText) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Enter promo text before enabling the ribbon" }, { status: 400 }),
      rl
    );
  }
  const desiredPromoExpiry = desiredPromoText ? desiredPromoExpiryRaw : null;
  if ((hasPromoText || hasPromoExpiry || hasPromoEnabled) && currentPromoText !== desiredPromoText) {
    productPatch.promo_tag_text = desiredPromoText;
  }
  if ((hasPromoText || hasPromoExpiry || hasPromoEnabled) && currentPromoExpiry !== desiredPromoExpiry) {
    productPatch.promo_tag_expires_at = desiredPromoExpiry;
  }
  if ((hasPromoText || hasPromoExpiry || hasPromoEnabled) && currentPromoEnabled !== desiredPromoEnabled) {
    productPatch.promo_tag_enabled = desiredPromoEnabled;
  }

  const variantPatch = {};
  if (hasVariantActive && existingVariant.is_active !== parsed.data.variant_is_active) {
    variantPatch.is_active = parsed.data.variant_is_active;
  }
  if (hasPurchaseMode && normalizePurchaseMode(existingVariant.purchase_mode) !== nextPurchaseMode) {
    variantPatch.purchase_mode = nextPurchaseMode;
  }
  if (hasMinQuantity && toPositiveNullableNumber(existingVariant.min_quantity) !== nextMinQuantity) {
    variantPatch.min_quantity = nextMinQuantity;
  }
  if (hasMaxQuantity && toPositiveNullableNumber(existingVariant.max_quantity) !== nextMaxQuantity) {
    variantPatch.max_quantity = nextMaxQuantity;
  }
  if (hasStepQuantity && toPositiveNullableNumber(existingVariant.step_quantity) !== nextStepQuantity) {
    variantPatch.step_quantity = nextStepQuantity;
  }
  if (hasBaseUnit && normalizeNullableText(existingVariant.base_unit, { max: 40 }) !== nextBaseUnit) {
    variantPatch.base_unit = nextBaseUnit;
  }
  if (hasBaseQuantity && toPositiveNullableNumber(existingVariant.base_quantity) !== nextBaseQuantity) {
    variantPatch.base_quantity = nextBaseQuantity;
  }
  if (hasAvailabilityMode && existingVariant.availability_mode !== parsed.data.availability_mode) variantPatch.availability_mode = parsed.data.availability_mode;
  if (hasInventoryTrackingMode && existingVariant.inventory_tracking_mode !== parsed.data.inventory_tracking_mode) variantPatch.inventory_tracking_mode = parsed.data.inventory_tracking_mode;
  if (hasOptionRole && (existingVariant.option_role || null) !== parsed.data.option_role) variantPatch.option_role = parsed.data.option_role;

  if (!Object.keys(productPatch).length && !Object.keys(variantPatch).length) {
    return applyRateLimitHeaders(NextResponse.json({ error: "No changes detected" }, { status: 400 }), rl);
  }

  let updatedVariant = existingVariant;
  let updatedProduct = existingProduct;

  if (variantId && Object.keys(variantPatch).length) {
    const result = await admin
      .from("product_variants")
      .update(variantPatch)
      .eq("id", variantId)
      .select("id, product_id, name, price, old_price, stock_count, is_active, purchase_mode, min_quantity, max_quantity, step_quantity, base_unit, base_quantity, availability_mode, inventory_tracking_mode, option_role")
      .maybeSingle();
    if (result.error) {
      await logAdminError(result.error, {
        route: "/api/admin/products/update",
        actor: user.email,
        product_id: productId,
        variant_id: variantId || undefined,
        patch: variantPatch,
        stage: "variant-update",
      });
      return applyRateLimitHeaders(NextResponse.json({ error: result.error.message }, { status: 400 }), rl);
    }
    if (result.data) updatedVariant = result.data;
  }

  if (Object.keys(productPatch).length) {
    const result = await admin
      .from("products")
      .update(productPatch)
      .eq("id", productId)
      .select("id, name, in_season, is_active, category_id, image_url, is_bundle_eligible, promo_tag_text, promo_tag_expires_at, promo_tag_enabled, selection_model, variation_note")
      .maybeSingle();
    if (result.error) {
      await logAdminError(result.error, {
        route: "/api/admin/products/update",
        actor: user.email,
        product_id: productId,
        variant_id: variantId || undefined,
        patch: productPatch,
        stage: "product-update",
      });
      return applyRateLimitHeaders(NextResponse.json({ error: result.error.message }, { status: 400 }), rl);
    }
    if (result.data) updatedProduct = result.data;
  }

  await logAdminEvent({
    route: "/api/admin/products/update",
    actor: user.email,
    product_id: productId,
    product_name: existingProduct.name,
    variant_id: variantId || undefined,
    variant_name: existingVariant?.name || undefined,
    before_in_season: existingProduct.in_season,
    after_in_season: updatedProduct.in_season,
    before_is_active: existingProduct.is_active,
    after_is_active: updatedProduct.is_active,
    before_category_id: existingProduct.category_id,
    after_category_id: updatedProduct.category_id,
    before_image_url: existingProduct.image_url,
    after_image_url: updatedProduct.image_url,
    before_is_bundle_eligible: existingProduct.is_bundle_eligible,
    after_is_bundle_eligible: updatedProduct.is_bundle_eligible,
    before_promo_tag_text: existingProduct.promo_tag_text,
    after_promo_tag_text: updatedProduct.promo_tag_text,
    before_promo_tag_expires_at: existingProduct.promo_tag_expires_at,
    after_promo_tag_expires_at: updatedProduct.promo_tag_expires_at,
    before_promo_tag_enabled: existingProduct.promo_tag_enabled,
    after_promo_tag_enabled: updatedProduct.promo_tag_enabled,
    before_variant_is_active: existingVariant?.is_active,
    after_variant_is_active: updatedVariant?.is_active,
    before_purchase_mode: existingVariant?.purchase_mode,
    after_purchase_mode: updatedVariant?.purchase_mode,
    before_min_quantity: existingVariant?.min_quantity,
    after_min_quantity: updatedVariant?.min_quantity,
    before_max_quantity: existingVariant?.max_quantity,
    after_max_quantity: updatedVariant?.max_quantity,
    before_step_quantity: existingVariant?.step_quantity,
    after_step_quantity: updatedVariant?.step_quantity,
    before_base_unit: existingVariant?.base_unit,
    after_base_unit: updatedVariant?.base_unit,
    before_base_quantity: existingVariant?.base_quantity,
    after_base_quantity: updatedVariant?.base_quantity,
    note: parsed.data.note || undefined,
    ok: true,
  });

  revalidatePublicCatalog();

  return applyRateLimitHeaders(
    NextResponse.json({
      ok: true,
      product: {
        id: updatedProduct.id,
        name: updatedProduct.name,
        in_season: updatedProduct.in_season,
        is_active: updatedProduct.is_active,
        category_id: updatedProduct.category_id,
        image_url: updatedProduct.image_url,
        is_bundle_eligible: updatedProduct.is_bundle_eligible,
        promo_tag_text: updatedProduct.promo_tag_text,
        promo_tag_expires_at: updatedProduct.promo_tag_expires_at,
        promo_tag_enabled: updatedProduct.promo_tag_enabled,
        selection_model: updatedProduct.selection_model,
        variation_note: updatedProduct.variation_note,
      },
      variant: updatedVariant
        ? {
            id: updatedVariant.id,
            product_id: updatedVariant.product_id,
            name: updatedVariant.name,
            price: updatedVariant.price,
            old_price: updatedVariant.old_price,
            stock_count: updatedVariant.stock_count,
            is_active: updatedVariant.is_active,
            purchase_mode: updatedVariant.purchase_mode,
            min_quantity: updatedVariant.min_quantity,
            max_quantity: updatedVariant.max_quantity,
            step_quantity: updatedVariant.step_quantity,
            base_unit: updatedVariant.base_unit,
            base_quantity: updatedVariant.base_quantity,
            availability_mode: updatedVariant.availability_mode,
            inventory_tracking_mode: updatedVariant.inventory_tracking_mode,
            option_role: updatedVariant.option_role,
          }
        : null,
    }),
    rl
  );
}
