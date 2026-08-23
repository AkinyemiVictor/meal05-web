import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { loadMarketCatalog } from "@/lib/market-catalog-server";
import { getAvailabilityDeadlines } from "@/lib/availability-hours";
import { formatAvailabilityDuration, toPublicAvailabilityTiming } from "@/lib/availability-settings";
import { loadAvailabilitySettings } from "@/lib/availability-settings-server";
import { normalizeAvailabilityMode } from "@/lib/commerce-options";
import { AVAILABILITY_REQUEST_SELECT, expireAvailabilityRequest, validatePreferenceForProduct } from "@/lib/availability-requests-server";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  deliveryAddress: z.string().trim().min(5).max(500),
  customerName: z.string().trim().min(2).max(160),
  customerPhone: z.string().trim().min(7).max(40),
  note: z.string().trim().max(1000).optional().default(""),
  idempotencyKey: z.string().trim().min(8).max(160),
});

const authenticate = async () => {
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user } } = await auth.auth.getUser();
  return user;
};

export async function GET() {
  const user = await authenticate();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("availability_requests")
    .select(AVAILABILITY_REQUEST_SELECT).eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const requests = await Promise.all((data || []).map((request) => expireAvailabilityRequest(admin, request)));
  return NextResponse.json({ requests });
}

export async function POST(request) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  const user = await authenticate();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check your details" }, { status: 400 });
  const admin = getSupabaseAdminClient();
  const existing = await admin.from("availability_requests").select(AVAILABILITY_REQUEST_SELECT)
    .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 400 });
  if (existing.data) {
    return NextResponse.json({ request: await expireAvailabilityRequest(admin, existing.data), replayed: true });
  }

  const catalog = await loadMarketCatalog(admin);
  let availabilitySettings;
  try {
    availabilitySettings = await loadAvailabilitySettings({ admin, marketId: catalog.market.id });
  } catch (settingsError) {
    return NextResponse.json(
      { error: settingsError?.message || "Availability confirmation is temporarily unavailable." },
      { status: 503 }
    );
  }

  const { data: cart, error: cartError } = await admin.from("cart_items")
    .select("id, product_id, variant_id, quantity, size_preference").eq("user_id", user.id).order("id");
  if (cartError) return NextResponse.json({ error: cartError.message }, { status: 400 });
  if (!cart?.length) return NextResponse.json({ error: "Your availability basket is empty" }, { status: 409 });

  const variantIds = [...new Set(cart.map((line) => line.variant_id))];
  const { data: variants, error: variantError } = await admin.from("product_variants")
    .select("id, product_id, name, unit, price, stock_count, is_active, market_id, availability_mode, inventory_tracking_mode")
    .in("id", variantIds).eq("market_id", catalog.market.id);
  if (variantError) return NextResponse.json({ error: variantError.message }, { status: 400 });
  const productIds = [...new Set((variants || []).map((variant) => variant.product_id))];
  const { data: products, error: productError } = await admin.from("products")
    .select("id, name, selection_model").in("id", productIds);
  if (productError) return NextResponse.json({ error: productError.message }, { status: 400 });
  const variantIndex = new Map((variants || []).map((row) => [String(row.id), row]));
  const productIndex = new Map((products || []).map((row) => [String(row.id), row]));
  let containsRequestItem = false;
  const itemRows = [];
  for (const line of cart) {
    const variant = variantIndex.get(String(line.variant_id));
    const product = variant ? productIndex.get(String(variant.product_id)) : null;
    if (!variant || !product || variant.is_active === false) return NextResponse.json({ error: "A basket item is no longer available" }, { status: 409 });
    const mode = normalizeAvailabilityMode(variant.availability_mode);
    if (mode === "unavailable") return NextResponse.json({ error: `${product.name} is unavailable` }, { status: 409 });
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: "A basket quantity is invalid" }, { status: 400 });
    if (mode === "standard" && variant.inventory_tracking_mode !== "supplier" && Number(variant.stock_count || 0) < quantity) {
      return NextResponse.json({ error: `${product.name} no longer has enough stock` }, { status: 409 });
    }
    const preference = validatePreferenceForProduct(line.size_preference, product);
    if (preference === undefined) return NextResponse.json({ error: `${product.name} does not accept a size preference` }, { status: 400 });
    const requiresConfirmation = mode === "request";
    containsRequestItem ||= requiresConfirmation;
    itemRows.push({
      product_id: variant.product_id, variant_id: variant.id, product_name: product.name,
      variant_name: variant.name, unit: variant.unit, quantity, submitted_unit_price: Number(variant.price),
      confirmed_unit_price: requiresConfirmation ? null : Number(variant.price), requires_confirmation: requiresConfirmation,
      resolution_status: requiresConfirmation ? "pending" : "not_required", size_preference: preference,
    });
  }
  if (!containsRequestItem) return NextResponse.json({ error: "No item in this basket requires availability confirmation" }, { status: 409 });

  const submittedTotal = itemRows.reduce((sum, item) => sum + item.quantity * item.submitted_unit_price, 0);
  const { confirmationDeadline } = getAvailabilityDeadlines(new Date(), availabilitySettings);
  const requestNumber = `AR-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: created, error: createError } = await admin.from("availability_requests").insert({
    request_number: requestNumber, user_id: user.id, market_id: catalog.market.id, status: "pending",
    delivery_address: parsed.data.deliveryAddress, customer_name: parsed.data.customerName,
    customer_phone: parsed.data.customerPhone, customer_note: parsed.data.note || null,
    submitted_total: submittedTotal, currency_code: catalog.market.currencyCode,
    confirmation_deadline_at: confirmationDeadline.toISOString(), idempotency_key: parsed.data.idempotencyKey,
  }).select("id").single();
  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 });
  const { error: itemError } = await admin.from("availability_request_items")
    .insert(itemRows.map((item) => ({ ...item, request_id: created.id })));
  if (itemError) {
    await admin.from("availability_requests").delete().eq("id", created.id);
    return NextResponse.json({ error: itemError.message }, { status: 400 });
  }
  await admin.from("cart_items").delete().eq("user_id", user.id);
  await admin.from("notifications").insert({
    user_id: user.id, channel: "in_app", event: "availability_request_received",
    subject: "Availability request received",
    body: `${requestNumber} is being checked. We’ll update you within ${formatAvailabilityDuration(availabilitySettings.confirmationSlaMinutes)} during business hours.`, status: "delivered", sent_at: new Date().toISOString(),
  });
  const { data: result } = await admin.from("availability_requests").select(AVAILABILITY_REQUEST_SELECT).eq("id", created.id).single();
  return NextResponse.json(
    { request: await expireAvailabilityRequest(admin, result), timing: toPublicAvailabilityTiming(availabilitySettings) },
    { status: 201 }
  );
}
