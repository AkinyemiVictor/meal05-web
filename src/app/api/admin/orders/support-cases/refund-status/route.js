import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiUser } from "@/lib/admin-api-auth";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { logAdminError, logAdminEvent } from "@/lib/api/log";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  case_id: z.union([z.string(), z.number()]),
  refund_status: z.enum(["pending", "refunded", "not_required"]),
  refund_reference: z.string().trim().max(160).optional(),
}).strict();

const send = (body, status, rl) => applyRateLimitHeaders(withNoStore(NextResponse.json(body, { status })), rl);

export async function POST(request) {
  const rl = await checkRateLimit({ request, id: "admin:orders:manual-refund-status", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);

  const auth = await requireAdminApiUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return send({ error: parsed.error.issues[0]?.message || "Check the refund decision." }, 400, rl);

  const caseId = Number(parsed.data.case_id);
  if (!Number.isSafeInteger(caseId) || caseId <= 0) return send({ error: "A valid support case is required." }, 400, rl);

  const admin = getSupabaseAdminClient();
  const { data: existing, error: loadError } = await admin
    .from("order_support_cases")
    .select("id, order_id, case_type, case_status, refund_amount, refund_status, refund_reference")
    .eq("id", caseId)
    .maybeSingle();

  if (loadError) return send({ error: loadError.message }, 400, rl);
  if (!existing) return send({ error: "Support case not found." }, 404, rl);
  if (existing.case_type !== "refund") return send({ error: "Only refund cases can receive a refund decision." }, 409, rl);
  if (parsed.data.refund_status === "refunded" && Number(existing.refund_amount) <= 0) {
    return send({ error: "Enter a refund amount before marking this case as refunded." }, 409, rl);
  }

  const now = new Date().toISOString();
  const nextStatus = parsed.data.refund_status;
  const payload = {
    refund_status: nextStatus,
    refund_method: nextStatus === "refunded" ? "bank_transfer" : null,
    refund_reference: nextStatus === "refunded" ? parsed.data.refund_reference || null : null,
    refunded_at: nextStatus === "refunded" ? now : null,
    refunded_by_user_id: nextStatus === "refunded" ? auth.user.id : null,
    refunded_by_email: nextStatus === "refunded" ? auth.user.email || null : null,
    case_status: nextStatus === "pending" ? "reviewing" : "resolved",
    resolved_at: nextStatus === "pending" ? null : now,
    updated_by_user_id: auth.user.id,
    updated_by_email: auth.user.email || null,
    updated_at: now,
  };

  const { data: saved, error: saveError } = await admin
    .from("order_support_cases")
    .update(payload)
    .eq("id", caseId)
    .select("*")
    .maybeSingle();

  if (saveError) {
    await logAdminError(saveError, { route: "/api/admin/orders/support-cases/refund-status", actor: auth.user.email, case_id: caseId });
    return send({ error: saveError.message }, 400, rl);
  }

  await logAdminEvent({
    route: "/api/admin/orders/support-cases/refund-status",
    actor: auth.user.email,
    case_id: caseId,
    order_id: existing.order_id,
    before_refund_status: existing.refund_status,
    after_refund_status: nextStatus,
    refund_amount: existing.refund_amount,
    external_bank_transfer_record_only: true,
    ok: true,
  });

  return send({ ok: true, case: saved, money_moved: false }, 200, rl);
}
