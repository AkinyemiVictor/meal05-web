import { cookies } from "next/headers";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { respondZodError } from "@/lib/api/validate";
import { getAvailableCount, resolveStockValueFromRow } from "@/lib/stock";
import { loadMarketCatalog } from "@/lib/market-catalog-server";
import { formatQuantity, roundQuantity, validateVariantQuantity } from "@/lib/purchase-quantities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loadVariantStock = async (client, variantId, marketId) => {
  const id = String(variantId || "").trim();
  if (!id) return { row: null, error: null };

  const result = await client
    .from("product_variants")
    .select("id, product_id, name, price, stock_count, is_active, market_id, currency_code, purchase_mode, min_quantity, max_quantity, step_quantity, base_unit, base_quantity")
    .eq("id", id)
    .eq("market_id", marketId)
    .maybeSingle();
  return { row: result.data, error: result.error };
};

export async function GET(req) {
  const authClient = getSupabaseRouteClient(await cookies());
  const rl = await checkRateLimit({ request: req, id: "cart:list", limit: 120, windowMs: 60_000 });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401 });

  const { data, error } = await authClient
    .from("cart_items")
    .select("id, quantity, product_id, variant_id, unit_price_at_add, variant_name, product_name, products(name, image_url)")
    .eq("user_id", user.id)
    .order("id", { ascending: true });

  if (error) return new Response(JSON.stringify({ error }), { status: 400 });

  const admin = getSupabaseAdminClient();
  const catalog = await loadMarketCatalog(admin);
  const rows = Array.isArray(data) ? data : [];
  const variantIds = rows.map((row) => row?.variant_id).filter(Boolean);
  if (!variantIds.length) return applyRateLimitHeaders(new Response(JSON.stringify([]), { status: 200 }), rl);
  const { data: variants, error: variantError } = await admin
    .from("product_variants")
    .select("id, product_id, name, price, unit, stock_count, is_active, market_id, currency_code, purchase_mode, min_quantity, max_quantity, step_quantity, base_unit, base_quantity")
    .in("id", variantIds)
    .eq("market_id", catalog.market.id)
    .eq("is_active", true);
  if (variantError) return new Response(JSON.stringify({ error: variantError.message }), { status: 400 });
  const variantIndex = new Map((variants || []).map((variant) => [String(variant.id), variant]));
  const validRows = rows.flatMap((row) => {
    const variant = variantIndex.get(String(row.variant_id));
    if (!variant || !catalog.listings.has(String(variant.product_id))) return [];
    const listing = catalog.listings.get(String(variant.product_id));
    return [{
      ...row,
      product_id: variant.product_id,
      variant_name: variant.name,
      product_name: listing?.local_name || row?.products?.name || row?.product_name || "",
      unit_price_at_add: Number(variant.price),
      currency_code: catalog.market.currencyCode,
      purchase_mode: variant.purchase_mode,
      min_quantity: variant.min_quantity,
      max_quantity: variant.max_quantity,
      step_quantity: variant.step_quantity,
      base_unit: variant.base_unit,
      base_quantity: variant.base_quantity,
    }];
  });
  return applyRateLimitHeaders(new Response(JSON.stringify(validRows), { status: 200 }), rl);
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
    quantity: z.number().positive().max(9999).optional().default(1),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    return respondZodError(parsed.error);
  }
  const { product_id, variant_id, product_name } = parsed.data;
  const quantity = roundQuantity(parsed.data.quantity);

  const variantKey = String(variant_id);
  const { row: variantStock, error: stockError } = await loadVariantStock(admin, variantKey, catalog.market.id);
  if (stockError) return new Response(JSON.stringify({ error: stockError.message || "Unable to validate stock" }), { status: 400 });
  const stockSource = variantStock;
  if (!stockSource) return new Response(JSON.stringify({ error: "Product option not found" }), { status: 404 });
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
  const nextQuantity = roundQuantity(Number(existing?.quantity || 0) + quantity);
  const quantityValidation = validateVariantQuantity(stockSource, nextQuantity);
  if (!quantityValidation.ok) {
    return new Response(
      JSON.stringify({
        error: quantityValidation.error,
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

  const writeRequest = existing?.id
    ? authClient
        .from("cart_items")
        .update({ ...payload, quantity: nextQuantity })
        .eq("id", existing.id)
        .eq("user_id", user.id)
    : authClient.from("cart_items").insert({
        user_id: user.id,
        ...payload,
        quantity,
      });

  const { error } = await writeRequest;

  if (error) return new Response(JSON.stringify({ error }), { status: 400 });
  return applyRateLimitHeaders(new Response(JSON.stringify({ message: "Item added to cart" }), { status: 201 }), rl);
}
