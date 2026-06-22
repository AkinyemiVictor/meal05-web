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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toId = (value) => {
  const num = Number(String(value || "").trim());
  return Number.isSafeInteger(num) && num > 0 ? num : null;
};

const toNullableNumber = (value) => {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeNullableText = (value, { max = 500 } = {}) => {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
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
    price: z.number().nonnegative().max(1_000_000_000).optional(),
    old_price: z.union([z.number().nonnegative().max(1_000_000_000), z.null()]).optional(),
    stock_count: z.number().int().nonnegative().max(1_000_000).optional(),
    variant_is_active: z.boolean().optional(),
    promo_tag_text: z.union([z.string().trim().max(80), z.null()]).optional(),
    promo_tag_expires_at: z.union([z.string().trim().max(80), z.null()]).optional(),
    promo_tag_enabled: z.boolean().optional(),
    note: z.string().trim().max(500).optional(),
  });
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
  const hasPrice = typeof parsed.data.price === "number";
  const hasOldPrice = Object.prototype.hasOwnProperty.call(parsed.data, "old_price");
  const hasStockCount = typeof parsed.data.stock_count === "number";
  const hasVariantActive = typeof parsed.data.variant_is_active === "boolean";
  const hasPromoText = Object.prototype.hasOwnProperty.call(parsed.data, "promo_tag_text");
  const hasPromoExpiry = Object.prototype.hasOwnProperty.call(parsed.data, "promo_tag_expires_at");
  const hasPromoEnabled = Object.prototype.hasOwnProperty.call(parsed.data, "promo_tag_enabled");
  if (
    !hasSeason &&
    !hasProductActive &&
    !hasCategory &&
    !hasImageUrl &&
    !hasBundleEligible &&
    !hasPrice &&
    !hasOldPrice &&
    !hasStockCount &&
    !hasVariantActive &&
    !hasPromoText &&
    !hasPromoExpiry &&
    !hasPromoEnabled
  ) {
    return applyRateLimitHeaders(NextResponse.json({ error: "No update fields provided" }, { status: 400 }), rl);
  }
  if ((hasPrice || hasOldPrice || hasStockCount || hasVariantActive) && !variantId) {
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

  const [productRes, variantRes] = await Promise.all([
    admin
      .from("products")
      .select("id, name, in_season, is_active, category_id, image_url, is_bundle_eligible, promo_tag_text, promo_tag_expires_at, promo_tag_enabled")
      .eq("id", productId)
      .maybeSingle(),
    variantId
      ? admin
          .from("product_variants")
          .select("id, product_id, name, price, old_price, stock_count, is_active")
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

  const nextPrice = hasPrice ? parsed.data.price : Number(existingVariant?.price);
  const requestedOldPrice = hasOldPrice ? parsed.data.old_price : existingVariant?.old_price;
  const normalizedOldPriceCleared =
    hasOldPrice && requestedOldPrice != null && Number(requestedOldPrice) < Number(nextPrice);
  const nextOldPrice = normalizedOldPriceCleared ? null : requestedOldPrice;

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
  if (hasPrice && Number(existingVariant.price) !== Number(parsed.data.price)) {
    variantPatch.price = parsed.data.price;
  }
  const currentOldPrice = toNullableNumber(existingVariant?.old_price);
  const desiredOldPrice = toNullableNumber(nextOldPrice);
  if (hasOldPrice && currentOldPrice !== desiredOldPrice) {
    variantPatch.old_price = desiredOldPrice;
  }
  if (hasStockCount && Number(existingVariant.stock_count) !== Number(parsed.data.stock_count)) {
    variantPatch.stock_count = parsed.data.stock_count;
  }
  if (hasVariantActive && existingVariant.is_active !== parsed.data.variant_is_active) {
    variantPatch.is_active = parsed.data.variant_is_active;
  }

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
      .select("id, product_id, name, price, old_price, stock_count, is_active")
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
      .select("id, name, in_season, is_active, category_id, image_url, is_bundle_eligible, promo_tag_text, promo_tag_expires_at, promo_tag_enabled")
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
    before_price: existingVariant?.price,
    after_price: updatedVariant?.price,
    before_old_price: existingVariant?.old_price,
    after_old_price: updatedVariant?.old_price,
    before_stock_count: existingVariant?.stock_count,
    after_stock_count: updatedVariant?.stock_count,
    before_variant_is_active: existingVariant?.is_active,
    after_variant_is_active: updatedVariant?.is_active,
    old_price_cleared: normalizedOldPriceCleared,
    note: parsed.data.note || undefined,
    ok: true,
  });

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
          }
        : null,
      normalized: {
        oldPriceCleared: normalizedOldPriceCleared,
      },
    }),
    rl
  );
}
