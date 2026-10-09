import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { respondZodError } from "@/lib/api/validate";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { resolveVariantForShoppingMode } from "@/lib/shopping-mode-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const quoteSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(30),
  deliveryAddress: z.string().trim().min(5).max(500),
  notes: z.string().trim().max(1500).optional().default(""),
  items: z.array(z.object({
    productId: z.union([z.string(), z.number()]).optional(),
    variantId: z.union([z.string(), z.number()]),
    quantity: z.number().finite().positive().max(999999),
  })).min(1).max(100),
});

export async function POST(request) {
  const rl = await checkRateLimit({ request, id: "business-quotes:create", limit: 10, windowMs: 60_000 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }); }
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) return respondZodError(parsed.error);

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user } } = await auth.auth.getUser();
  const admin = getSupabaseAdminClient();
  const variantIds = [...new Set(parsed.data.items.map((item) => String(item.variantId)))];
  const { data: variants, error: variantError } = await admin
    .from("product_variants")
    .select("id, product_id, name, price, is_active, min_quantity, max_quantity, step_quantity, availability_mode, inventory_tracking_mode")
    .in("id", variantIds)
    .eq("is_active", true);
  if (variantError) return NextResponse.json({ error: "Unable to validate requested products" }, { status: 400 });
  const variantIndex = new Map((variants || []).map((variant) => [String(variant.id), variant]));

  const validatedItems = [];
  for (const item of parsed.data.items) {
    const variant = variantIndex.get(String(item.variantId));
    if (!variant) return NextResponse.json({ error: "One of the requested product options is unavailable" }, { status: 409 });
    if (item.productId != null && String(item.productId) !== String(variant.product_id)) {
      return NextResponse.json({ error: "Product and option do not match" }, { status: 400 });
    }
    const resolved = await resolveVariantForShoppingMode(admin, variant, "business");
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 409 });
    const min = Number(resolved.variant.min_quantity || 0);
    const max = Number(resolved.variant.max_quantity || 0);
    if (min > 0 && item.quantity < min) return NextResponse.json({ error: `Minimum business quantity is ${min}` }, { status: 400 });
    if (max > 0 && item.quantity > max) return NextResponse.json({ error: `Maximum business quantity is ${max}` }, { status: 400 });
    validatedItems.push({ item, variant, resolved });
  }

  const productIds = [...new Set(validatedItems.map(({ variant }) => variant.product_id))];
  const { data: products, error: productError } = await admin.from("products").select("id, name, unit").in("id", productIds);
  if (productError) return NextResponse.json({ error: "Unable to load requested products" }, { status: 400 });
  const productIndex = new Map((products || []).map((product) => [String(product.id), product]));
  const reference = `BQ-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: quote, error: quoteError } = await admin.from("business_quote_requests").insert({
    user_id: user?.id || null,
    reference,
    business_name: parsed.data.businessName,
    contact_name: parsed.data.contactName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    delivery_address: parsed.data.deliveryAddress,
    notes: parsed.data.notes || null,
  }).select("id, reference, status, created_at").single();
  if (quoteError) return NextResponse.json({ error: "Unable to save quote request" }, { status: 400 });

  const rows = validatedItems.map(({ item, variant, resolved }) => ({
    quote_request_id: quote.id,
    product_id: variant.product_id,
    variant_id: variant.id,
    product_name: productIndex.get(String(variant.product_id))?.name || "Product",
    variant_name: variant.name || null,
    quantity: item.quantity,
    requested_unit: productIndex.get(String(variant.product_id))?.unit || null,
    configured_unit_price: resolved.quoteOnly ? null : Number(resolved.variant.price),
    supplier_confirmation_required: resolved.supplierConfirmationRequired,
  }));
  const { error: itemError } = await admin.from("business_quote_items").insert(rows);
  if (itemError) {
    await admin.from("business_quote_requests").delete().eq("id", quote.id);
    return NextResponse.json({ error: "Unable to save quote items" }, { status: 400 });
  }
  return applyRateLimitHeaders(NextResponse.json({ quote, message: "Your quotation request has been received." }, { status: 201 }), rl);
}
