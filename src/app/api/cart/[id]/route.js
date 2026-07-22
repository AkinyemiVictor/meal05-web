import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { respondZodError } from "@/lib/api/validate";
import { getAvailableCount } from "@/lib/stock";
import { loadMarketCatalog } from "@/lib/market-catalog-server";
import { decimalPlaces, formatQuantity, roundQuantity, validateVariantQuantity } from "@/lib/purchase-quantities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  const { id } = (await params) || {};
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const authClient = getSupabaseRouteClient(await cookies());
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rl = await checkRateLimit({ request: req, id: "cart:update", limit: 60, windowMs: 60_000 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const schema = z.object({
    quantity: z
      .number()
      .finite()
      .positive()
      .max(9999)
      .refine((value) => decimalPlaces(value) <= 3, "Quantity may use no more than three decimal places"),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    return respondZodError(parsed.error);
  }
  const quantityNum = roundQuantity(parsed.data.quantity);

  const routeClient = getSupabaseRouteClient(await cookies());
  const { data: cartItem, error: cartError } = await routeClient
    .from("cart_items")
    .select("id, variant_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (cartError) return applyRateLimitHeaders(NextResponse.json({ error: cartError.message }, { status: 400 }), rl);
  if (!cartItem) return applyRateLimitHeaders(NextResponse.json({ error: "Item not found" }, { status: 404 }), rl);

  const admin = getSupabaseAdminClient();
  const catalog = await loadMarketCatalog(admin);
  const { data: variant, error: variantError } = await admin
    .from("product_variants")
    .select("id, product_id, stock_count, is_active, purchase_mode, min_quantity, max_quantity, step_quantity, base_unit, base_quantity, weight_min, weight_max, weight_unit, volume_min, volume_max, volume_unit, option_role")
    .eq("id", cartItem.variant_id)
    .eq("market_id", catalog.market.id)
    .maybeSingle();
  if (variantError) return applyRateLimitHeaders(NextResponse.json({ error: variantError.message }, { status: 400 }), rl);
  if (!variant || variant.is_active === false || !catalog.listings.has(String(variant.product_id))) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Product option is unavailable in this market" }, { status: 409 }), rl);
  }
  const quantityValidation = validateVariantQuantity(variant, quantityNum);
  if (!quantityValidation.ok) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: quantityValidation.error, requested: formatQuantity(quantityNum) }, { status: 400 }),
      rl
    );
  }
  const available = getAvailableCount(variant.stock_count);
  if (Number.isFinite(available) && quantityNum > available) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: `Only ${available} item${available === 1 ? "" : "s"} available`, available, requested: quantityNum }, { status: 409 }),
      rl
    );
  }
  const { data, error } = await routeClient
    .from("cart_items")
    .update({ quantity: quantityNum })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) return applyRateLimitHeaders(NextResponse.json({ error }, { status: 400 }), rl);
  if (!data || data.length === 0) return applyRateLimitHeaders(NextResponse.json({ error: "Item not found" }, { status: 404 }), rl);
  return applyRateLimitHeaders(NextResponse.json({ message: "Quantity updated" }, { status: 200 }), rl);
}

export async function DELETE(req, { params }) {
  const { id } = (await params) || {};
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const authClient = getSupabaseRouteClient(await cookies());
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rl = await checkRateLimit({ request: req, id: "cart:remove", limit: 60, windowMs: 60_000 });
  const routeClient = getSupabaseRouteClient(await cookies());
  const { data, error } = await routeClient
    .from("cart_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) return applyRateLimitHeaders(NextResponse.json({ error }, { status: 400 }), rl);
  if (!data || data.length === 0) return applyRateLimitHeaders(NextResponse.json({ error: "Item not found" }, { status: 404 }), rl);
  return applyRateLimitHeaders(NextResponse.json({ message: "Item removed" }, { status: 200 }), rl);
}
