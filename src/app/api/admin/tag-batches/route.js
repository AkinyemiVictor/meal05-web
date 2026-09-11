import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiUser } from "@/lib/admin-api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { loadTagBatches } from "@/lib/tag-buy-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  variantId: z.coerce.number().int().positive(),
  tagPrice: z.coerce.number().nonnegative(),
  targetQuantity: z.coerce.number().positive(),
  minimumViableQuantity: z.coerce.number().positive(),
  maximumQuantity: z.coerce.number().positive(),
  closesAt: z.string().datetime(),
  expectedProcurementAt: z.string().datetime(),
  failurePolicy: z.enum(["refund", "carry_forward"]).default("refund"),
  carryForwardBatchId: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "open"]).default("draft"),
}).strict();

const refresh = () => {
  revalidateTag("products");
  revalidatePath("/home");
  revalidatePath("/shop");
  revalidatePath("/admin/tag-buys");
};

export async function GET() {
  const auth = await requireAdminApiUser();
  if (auth.response) return auth.response;
  try {
    const batches = await loadTagBatches({ statuses: [] });
    return NextResponse.json({ batches }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to load Tag Buys." }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireAdminApiUser();
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  if (input.minimumViableQuantity > input.targetQuantity || input.targetQuantity > input.maximumQuantity) {
    return NextResponse.json({ error: "Quantities must satisfy minimum viable ≤ target ≤ maximum." }, { status: 400 });
  }
  if (new Date(input.expectedProcurementAt) <= new Date(input.closesAt)) {
    return NextResponse.json({ error: "Expected procurement must be after the Tag Buy closes." }, { status: 400 });
  }
  const admin = getSupabaseAdminClient();
  const { data: variant, error: variantError } = await admin
    .from("product_variants")
    .select("id, product_id, market_id, price, currency_code, is_active, tag_buy_eligible, tag_buy_purchase_mode, tag_buy_priority_tier")
    .eq("id", input.variantId)
    .maybeSingle();
  if (variantError || !variant || variant.is_active === false) return NextResponse.json({ error: "Active product option not found." }, { status: 404 });
  if (!variant.tag_buy_eligible) return NextResponse.json({ error: "This product option is not eligible for Tag Buy." }, { status: 409 });
  if (input.tagPrice >= Number(variant.price)) {
    return NextResponse.json({ error: "Tag price must be lower than the regular price." }, { status: 400 });
  }
  const { data, error } = await admin.from("tag_batches").insert({
    market_id: variant.market_id,
    product_id: variant.product_id,
    variant_id: variant.id,
    status: input.status,
    tag_price: input.tagPrice,
    standard_price_at_open: Number(variant.price),
    target_quantity: input.targetQuantity,
    minimum_viable_quantity: input.minimumViableQuantity,
    maximum_quantity: input.maximumQuantity,
    closes_at: input.closesAt,
    expected_procurement_at: input.expectedProcurementAt,
    failure_policy: input.failurePolicy,
    purchase_mode: variant.tag_buy_purchase_mode,
    carry_forward_batch_id: input.failurePolicy === "carry_forward" ? input.carryForwardBatchId || null : null,
    created_by: auth.user.id,
    updated_by: auth.user.id,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message || "Unable to create Tag Buy." }, { status: 409 });
  refresh();
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
