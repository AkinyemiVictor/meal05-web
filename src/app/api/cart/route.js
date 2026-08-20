import { cookies } from "next/headers";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { respondZodError } from "@/lib/api/validate";
import { getAvailableCount, resolveStockValueFromRow } from "@/lib/stock";
import { loadMarketCatalog } from "@/lib/market-catalog-server";
import { decimalPlaces, formatQuantity, roundQuantity, validateVariantQuantity } from "@/lib/purchase-quantities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normaliseQuantityError = (message) => {
  const raw = String(message || "").trim();
  if (!raw) return "Unable to update cart quantity.";
  if (/^quantity must be positive/i.test(raw)) return "Quantity cannot go below the minimum.";
  if (/^minimum is\b/i.test(raw)) return raw.replace(/^Minimum is\b/i, "Minimum quantity is");
  if (/^maximum is\b/i.test(raw)) return raw.replace(/^Maximum is\b/i, "Maximum quantity is");
  if (/product option|variant/i.test(raw)) return "This item option is unavailable. Remove it and add it again.";
  return raw;
};

const loadVariantStock = async (client, variantId, marketId) => {
  const id = String(variantId || "").trim();
  if (!id) return { row: null, error: null };

  const result = await client
    .from("product_variants")
    .select("id, product_id, name, price, stock_count, is_active, market_id, currency_code, purchase_mode, min_quantity, max_quantity, step_quantity, base_unit, base_quantity, weight_min, weight_max, weight_unit, volume_min, volume_max, volume_unit, option_role")
    .eq("id", id)
    .eq("market_id", marketId)
    .maybeSingle();
  return { row: result.data, error: result.error };
};

const loadCanonicalCart = async (admin, userId, catalog) => {
  const { data: rows, error: cartError } = await admin
    .from("cart_items")
    .select("id, quantity, product_id, variant_id, unit_price_at_add, variant_name, product_name")
    .eq("user_id", userId)
    .order("id", { ascending: true });
  if (cartError) throw cartError;

  const cartRows = Array.isArray(rows) ? rows : [];
  if (!cartRows.length) return [];

  const variantIds = [...new Set(cartRows.map((row) => row.variant_id).filter(Boolean))];
  const { data: variants, error: variantError } = await admin
    .from("product_variants")
    .select("id, product_id, name, price, unit, stock_count, is_active, market_id, currency_code, purchase_mode, min_quantity, max_quantity, step_quantity, base_unit, base_quantity, weight_min, weight_max, weight_unit, volume_min, volume_max, volume_unit, option_role")
    .in("id", variantIds)
    .eq("market_id", catalog.market.id)
    .eq("is_active", true);
  if (variantError) throw variantError;

  const productIds = [...new Set((variants || []).map((variant) => variant.product_id).filter(Boolean))];
  const [productResult, eligibilityResult] = productIds.length
    ? await Promise.all([
        admin.from("products").select("id, name, main_image_url").in("id", productIds),
        admin
          .from("product_card_catalog")
          .select("product_id, main_image_url, thumb_image_url, card_image_url, detail_image_url")
          .eq("market_id", catalog.market.id)
          .in("product_id", productIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const { data: products, error: productError } = productResult;
  if (productError) throw productError;
  if (eligibilityResult.error) throw eligibilityResult.error;

  const variantIndex = new Map((variants || []).map((variant) => [String(variant.id), variant]));
  const productIndex = new Map((products || []).map((product) => [String(product.id), product]));
  const catalogImageIndex = new Map(
    (eligibilityResult.data || []).map((row) => [String(row.product_id), row])
  );
  const eligibleProductIds = new Set(
    (eligibilityResult.data || []).map((row) => String(row.product_id))
  );

  return cartRows.flatMap((row) => {
    const variant = variantIndex.get(String(row.variant_id));
    if (
      !variant ||
      !catalog.listings.has(String(variant.product_id)) ||
      !eligibleProductIds.has(String(variant.product_id))
    ) return [];
    const listing = catalog.listings.get(String(variant.product_id));
    const product = productIndex.get(String(variant.product_id));
    const catalogImage = catalogImageIndex.get(String(variant.product_id));
    return [{
      ...row,
      product_id: variant.product_id,
      variant_name: variant.name,
      product_name: listing?.local_name || product?.name || row.product_name || "",
      image_url:
        catalogImage?.thumb_image_url ||
        catalogImage?.card_image_url ||
        catalogImage?.detail_image_url ||
        catalogImage?.main_image_url ||
        product?.main_image_url ||
        "",
      unit_price_at_add: Number(variant.price),
      currency_code: catalog.market.currencyCode,
      unit: variant.unit,
      stock_count: variant.stock_count,
      purchase_mode: variant.purchase_mode,
      min_quantity: variant.min_quantity,
      max_quantity: variant.max_quantity,
      step_quantity: variant.step_quantity,
      base_unit: variant.base_unit,
      base_quantity: variant.base_quantity,
      weight_min: variant.weight_min,
      weight_max: variant.weight_max,
      weight_unit: variant.weight_unit,
      volume_min: variant.volume_min,
      volume_max: variant.volume_max,
      volume_unit: variant.volume_unit,
      option_role: variant.option_role,
    }];
  });
};

export async function GET(req) {
  const authClient = getSupabaseRouteClient(await cookies());
  const rl = await checkRateLimit({ request: req, id: "cart:list", limit: 120, windowMs: 60_000 });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401 });

  const admin = getSupabaseAdminClient();
  const catalog = await loadMarketCatalog(admin);
  try {
    const cart = await loadCanonicalCart(admin, user.id, catalog);
    return applyRateLimitHeaders(Response.json(cart), rl);
  } catch (error) {
    return applyRateLimitHeaders(Response.json({ error: error.message || "Unable to load cart" }, { status: 400 }), rl);
  }
}

export async function POST(req) {
  const authClient = getSupabaseRouteClient(await cookies());
  const rl = await checkRateLimit({ request: req, id: "cart:add", limit: 60, windowMs: 60_000 });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401 });
  const admin = getSupabaseAdminClient();
  const catalog = await loadMarketCatalog(admin);

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), { status: 400 });
  }
  const schema = z.object({
    product_id: z.union([z.string(), z.number()]).optional(),
    variant_id: z.union([z.string(), z.number()]),
    variant_name: z.string().min(1).max(200).optional(),
    product_name: z.string().min(1).max(200).optional(),
    unit_price_at_add: z.number().nonnegative().optional(),
    quantity: z.number().finite().positive().max(9999).refine((value) => decimalPlaces(value) <= 3, "Quantity may use no more than three decimal places").optional().default(1),
    operation: z.enum(["increment", "set"]).optional().default("increment"),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    return respondZodError(parsed.error);
  }
  const { product_id, variant_id, product_name } = parsed.data;
  const quantity = roundQuantity(parsed.data.quantity);

  const variantKey = String(variant_id);
  const stockResult = await loadVariantStock(admin, variantKey, catalog.market.id);
  const { row: variantStock, error: stockError } = stockResult;
  if (stockError) return new Response(JSON.stringify({ error: stockError.message || "Unable to validate stock" }), { status: 400 });
  const stockSource = variantStock;
  if (!stockSource) return new Response(JSON.stringify({ error: "Product option not found" }), { status: 404 });
  const eligibilityResult = await admin
    .from("product_card_catalog")
    .select("product_id")
    .eq("market_id", catalog.market.id)
    .eq("product_id", stockSource.product_id)
    .maybeSingle();
  if (eligibilityResult.error) {
    return new Response(JSON.stringify({ error: eligibilityResult.error.message || "Unable to validate product" }), { status: 400 });
  }
  if (!eligibilityResult.data) {
    return new Response(JSON.stringify({ error: "This product is currently unavailable" }), { status: 409 });
  }
  if (!catalog.listings.has(String(stockSource.product_id))) {
    return new Response(JSON.stringify({ error: "Product is not listed in this market" }), { status: 409 });
  }
  if (stockSource.currency_code !== catalog.market.currencyCode) {
    return new Response(JSON.stringify({ error: "Product currency does not match this market" }), { status: 409 });
  }
  if (product_id != null && String(product_id) !== String(stockSource.product_id)) {
    return new Response(JSON.stringify({ error: "Product and variant do not match" }), { status: 400 });
  }
  if (stockSource.is_active === false) {
    return new Response(JSON.stringify({ error: "This option is out of stock", available: 0 }), { status: 409 });
  }

  const { data: existingRows, error: findError } = await authClient
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("variant_id", variantKey)
    .order("id", { ascending: true })
    .limit(1);

  if (findError) return new Response(JSON.stringify({ error: findError }), { status: 400 });

  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  const nextQuantity = parsed.data.operation === "set"
    ? quantity
    : roundQuantity(Number(existing?.quantity || 0) + quantity);
  const quantityValidation = validateVariantQuantity(stockSource, nextQuantity);
  if (!quantityValidation.ok) {
    return new Response(
      JSON.stringify({
        error: normaliseQuantityError(quantityValidation.error),
        requested: nextQuantity,
      }),
      { status: 400 }
    );
  }
  const availableCount = getAvailableCount(resolveStockValueFromRow(stockSource));
  if (availableCount === 0) {
    return new Response(JSON.stringify({ error: "This option is out of stock", available: 0 }), { status: 409 });
  }
  if (Number.isFinite(availableCount) && nextQuantity > availableCount) {
    return new Response(
      JSON.stringify({
        error: `Only ${availableCount} item${availableCount === 1 ? "" : "s"} available`,
        available: availableCount,
        requested: formatQuantity(nextQuantity),
      }),
      { status: 409 }
    );
  }

  const payload = {
    product_id: stockSource.product_id,
    variant_id: variantKey,
    variant_name: stockSource.name,
    product_name: catalog.listings.get(String(stockSource.product_id))?.local_name || product_name || stockSource.name,
    unit_price_at_add: Number(stockSource.price),
  };

  const { error } = await authClient
    .from("cart_items")
    .upsert(
      { user_id: user.id, ...payload, quantity: nextQuantity, updated_at: new Date().toISOString() },
      { onConflict: "user_id,variant_id" }
    );

  if (error) return Response.json({ error: error.message || "Unable to update cart" }, { status: 400 });
  try {
    const cart = await loadCanonicalCart(admin, user.id, catalog);
    return applyRateLimitHeaders(Response.json({ message: "Cart updated", cart }, { status: 201 }), rl);
  } catch (cartError) {
    return applyRateLimitHeaders(Response.json({ error: cartError.message || "Unable to reload cart" }, { status: 400 }), rl);
  }
}