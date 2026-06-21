import { cookies } from "next/headers";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { respondZodError } from "@/lib/api/validate";
import { getAvailableCount, resolveStockValueFromRow } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isUnknownColumnError = (message) => {
  const errorText = String(message || "");
  return (
    /schema cache/i.test(errorText) ||
    /column .* does not exist/i.test(errorText) ||
    /could not find the .* column/i.test(errorText)
  );
};

const loadVariantStock = async (client, variantId) => {
  const id = String(variantId || "").trim();
  if (!id) return { row: null, error: null };

  const selects = [
    "id, stock_count, stock, is_active",
    "id, stock_count, is_active",
    "id, stock, is_active",
    "id, stock_count",
    "id, stock",
    "id",
  ];

  let lastError = null;
  for (const select of selects) {
    const result = await client.from("product_variants").select(select).eq("id", id).maybeSingle();
    if (!result.error) return { row: result.data, error: null };
    lastError = result.error;
    if (isUnknownColumnError(result.error.message)) continue;
    break;
  }

  return { row: null, error: lastError };
};

const loadProductStock = async (client, productId) => {
  const id = String(productId || "").trim();
  if (!id) return { row: null, error: null };

  const selects = [
    "id, stock_count, stock, is_active",
    "id, stock_count, is_active",
    "id, stock, is_active",
    "id, stock_count",
    "id, stock",
    "id",
  ];

  let lastError = null;
  for (const select of selects) {
    const result = await client.from("products").select(select).eq("id", id).maybeSingle();
    if (!result.error) return { row: result.data, error: null };
    lastError = result.error;
    if (isUnknownColumnError(result.error.message)) continue;
    break;
  }

  return { row: null, error: lastError };
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
  return applyRateLimitHeaders(new Response(JSON.stringify(data || []), { status: 200 }), rl);
}

export async function POST(req) {
  const authClient = getSupabaseRouteClient(await cookies());
  const rl = await checkRateLimit({ request: req, id: "cart:add", limit: 60, windowMs: 60_000 });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401 });

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
    quantity: z.number().int().positive().max(999).optional().default(1),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    return respondZodError(parsed.error);
  }
  const { product_id, variant_id, variant_name, product_name, unit_price_at_add, quantity } = parsed.data;

  const variantKey = String(variant_id);
  const { row: variantStock, error: stockError } = await loadVariantStock(authClient, variantKey);
  if (stockError) return new Response(JSON.stringify({ error: stockError.message || "Unable to validate stock" }), { status: 400 });
  const { row: productStock, error: productStockError } = variantStock
    ? { row: null, error: null }
    : await loadProductStock(authClient, product_id);
  if (productStockError) {
    return new Response(JSON.stringify({ error: productStockError.message || "Unable to validate stock" }), { status: 400 });
  }
  const stockSource = variantStock || productStock;
  if (!stockSource) return new Response(JSON.stringify({ error: "Product option not found" }), { status: 404 });
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
  const nextQuantity = Number(existing?.quantity || 0) + quantity;
  const availableCount = getAvailableCount(resolveStockValueFromRow(stockSource));
  if (availableCount === 0) {
    return new Response(JSON.stringify({ error: "This option is out of stock", available: 0 }), { status: 409 });
  }
  if (Number.isFinite(availableCount) && nextQuantity > availableCount) {
    return new Response(
      JSON.stringify({
        error: `Only ${availableCount} item${availableCount === 1 ? "" : "s"} available`,
        available: availableCount,
        requested: nextQuantity,
      }),
      { status: 409 }
    );
  }

  const payload = {
    product_id: product_id ?? null,
    variant_id: variantKey,
    variant_name: variant_name ?? null,
    product_name: product_name ?? null,
    unit_price_at_add: unit_price_at_add ?? null,
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
