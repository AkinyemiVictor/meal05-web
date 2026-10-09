import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiUser } from "@/lib/admin-api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { resolveVariantForShoppingMode } from "@/lib/shopping-mode-server";

const schema = z.object({
  source: z.enum(["whatsapp", "phone", "admin"]),
  businessName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  address: z.string().trim().min(5).max(500),
  paymentMethod: z.string().trim().min(2).max(40).default("bank"),
  notes: z.string().trim().max(1000).optional().default(""),
  items: z.array(z.object({ variantId: z.union([z.string(), z.number()]), quantity: z.number().positive(), unitPrice: z.number().nonnegative() })).min(1).max(100),
});

export async function POST(request) {
  const guard = await requireAdminApiUser();
  if (guard.response) return guard.response;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid order" }, { status: 400 });
  const admin = getSupabaseAdminClient();
  const ids = [...new Set(parsed.data.items.map((item) => String(item.variantId)))];
  const { data: variants, error } = await admin.from("product_variants").select("id, product_id, name, unit, is_active, min_quantity, max_quantity, step_quantity, availability_mode").in("id", ids).eq("is_active", true);
  if (error || variants?.length !== ids.length) return NextResponse.json({ error: "One or more product options are unavailable" }, { status: 409 });
  const index = new Map(variants.map((variant) => [String(variant.id), variant]));
  const accepted = [];
  for (const item of parsed.data.items) {
    const variant = index.get(String(item.variantId));
    const resolved = await resolveVariantForShoppingMode(admin, variant, "business");
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 409 });
    if (resolved.variant.availability_mode === "unavailable") return NextResponse.json({ error: `${variant.name} is unavailable` }, { status: 409 });
    accepted.push({ ...item, variant, resolved });
  }
  const productIds = [...new Set(accepted.map((item) => item.variant.product_id))];
  const { data: products } = await admin.from("products").select("id, name, main_image_url").in("id", productIds);
  const productsById = new Map((products || []).map((product) => [String(product.id), product]));
  const subtotal = accepted.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const reference = `BIZ-${randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: order, error: orderError } = await admin.from("orders").insert({
    order_reference: reference, total: subtotal, subtotal, status: "processing", payment_status: "unpaid",
    payment_method: parsed.data.paymentMethod, delivery_address: parsed.data.address, delivery_contact_name: parsed.data.contactName,
    delivery_contact_phone: parsed.data.phone, customer_note: parsed.data.notes || null, shopping_mode: "business",
    order_source: parsed.data.source, business_name: parsed.data.businessName, business_contact_name: parsed.data.contactName,
    business_phone: parsed.data.phone, business_address: parsed.data.address,
  }).select("id, order_reference").single();
  if (orderError) return NextResponse.json({ error: orderError.message || "Unable to create order" }, { status: 400 });
  const orderItems = accepted.map((item) => ({
    order_id: order.id, product_id: item.variant.product_id, variant_id: item.variant.id, quantity: item.quantity,
    price: item.unitPrice, product_name: productsById.get(String(item.variant.product_id))?.name || "Product",
    variant_name: item.variant.name, unit: item.variant.unit || null, image_url: productsById.get(String(item.variant.product_id))?.main_image_url || null,
  }));
  const { error: itemsError } = await admin.from("order_items").insert(orderItems);
  if (itemsError) { await admin.from("orders").delete().eq("id", order.id); return NextResponse.json({ error: itemsError.message || "Unable to save order items" }, { status: 400 }); }
  return NextResponse.json({ order }, { status: 201 });
}
