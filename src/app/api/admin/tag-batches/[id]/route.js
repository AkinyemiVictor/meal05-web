import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiUser } from "@/lib/admin-api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum(["draft", "open", "cancelled", "fulfilled"]).optional(),
  targetQuantity: z.coerce.number().positive().optional(),
  minimumViableQuantity: z.coerce.number().positive().optional(),
  maximumQuantity: z.coerce.number().positive().optional(),
  closesAt: z.string().datetime().optional(),
  expectedProcurementAt: z.string().datetime().optional(),
  failurePolicy: z.enum(["refund", "carry_forward"]).optional(),
  carryForwardBatchId: z.string().uuid().nullable().optional(),
}).strict();

export async function PATCH(request, { params }) {
  const auth = await requireAdminApiUser();
  if (auth.response) return auth.response;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  const updates = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.targetQuantity != null ? { target_quantity: input.targetQuantity } : {}),
    ...(input.minimumViableQuantity != null ? { minimum_viable_quantity: input.minimumViableQuantity } : {}),
    ...(input.maximumQuantity != null ? { maximum_quantity: input.maximumQuantity } : {}),
    ...(input.closesAt ? { closes_at: input.closesAt } : {}),
    ...(input.expectedProcurementAt ? { expected_procurement_at: input.expectedProcurementAt } : {}),
    ...(input.failurePolicy ? { failure_policy: input.failurePolicy } : {}),
    ...(Object.hasOwn(input, "carryForwardBatchId") ? { carry_forward_batch_id: input.carryForwardBatchId } : {}),
    updated_by: auth.user.id,
    updated_at: new Date().toISOString(),
  };
  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("tag_batches").update(updates).eq("id", id).in("status", ["draft", "open", "procurement"]);
  if (error) return NextResponse.json({ error: error.message || "Unable to update Tag Buy." }, { status: 409 });
  revalidateTag("products");
  revalidatePath("/home");
  revalidatePath("/shop");
  revalidatePath("/admin/tag-buys");
  return NextResponse.json({ ok: true });
}
