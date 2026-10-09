import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiUser } from "@/lib/admin-api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

const schema = z.object({
  productId: z.union([z.string(), z.number()]),
  variantId: z.union([z.string(), z.number()]),
  productVisible: z.boolean(),
  productRequiresQuote: z.boolean(),
  purchasingConditions: z.string().trim().max(500).nullable().optional(),
  variantVisible: z.boolean(),
  price: z.number().finite().nonnegative().nullable(),
  minQuantity: z.number().finite().positive().nullable(),
  maxQuantity: z.number().finite().positive().nullable(),
  stepQuantity: z.number().finite().positive().nullable(),
  packagingLabel: z.string().trim().max(120).nullable().optional(),
  availabilityMode: z.enum(["standard", "request", "unavailable"]),
  supplierConfirmationRequired: z.boolean(),
  directCheckoutEnabled: z.boolean(),
});

export async function PATCH(request) {
  const guard = await requireAdminApiUser();
  if (guard.response) return guard.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid catalogue settings" }, { status: 400 });
  const input = parsed.data;
  if (input.minQuantity != null && input.maxQuantity != null && input.minQuantity > input.maxQuantity) {
    return NextResponse.json({ error: "Minimum quantity cannot exceed maximum quantity" }, { status: 400 });
  }
  const admin = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const [productResult, variantResult] = await Promise.all([
    admin.from("product_mode_settings").upsert({
      product_id: input.productId, shopping_mode: "business", is_visible: input.productVisible,
      requires_quote: input.productRequiresQuote, purchasing_conditions: input.purchasingConditions || null, updated_at: now,
    }, { onConflict: "product_id,shopping_mode" }),
    admin.from("product_variant_mode_settings").upsert({
      variant_id: input.variantId, shopping_mode: "business", is_visible: input.variantVisible, price: input.price,
      min_quantity: input.minQuantity, max_quantity: input.maxQuantity, step_quantity: input.stepQuantity,
      packaging_label: input.packagingLabel || null, availability_mode: input.availabilityMode,
      supplier_confirmation_required: input.supplierConfirmationRequired, direct_checkout_enabled: input.directCheckoutEnabled, updated_at: now,
    }, { onConflict: "variant_id,shopping_mode" }),
  ]);
  const error = productResult.error || variantResult.error;
  if (error) return NextResponse.json({ error: error.message || "Unable to save business catalogue settings" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
