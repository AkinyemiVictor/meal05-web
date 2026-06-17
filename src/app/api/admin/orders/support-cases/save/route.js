import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminAccess } from "@/lib/admin-access";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { logAdminEvent, logAdminError } from "@/lib/api/log";
import { respondZodError } from "@/lib/api/validate";
import {
  isClosedOrderSupportCaseStatus,
  isOrderSupportCaseStatus,
  isOrderSupportCaseType,
  normalizeOrderSupportCaseStatus,
  normalizeOrderSupportCaseType,
} from "@/lib/order-support";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isMissingOrderSupportSchemaError = (message) =>
  /relation .*order_support_cases.* does not exist|column .*order_support_cases.* does not exist|schema cache/i.test(
    String(message || "")
  );

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:orders:support-cases:save", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  }

  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr) {
    await logAdminError(authErr, { route: "/api/admin/orders/support-cases/save", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  }
  if (!user) {
    await logAdminError("Not authenticated", { route: "/api/admin/orders/support-cases/save", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    await logAdminError("Forbidden admin attempt", { route: "/api/admin/orders/support-cases/save", actor: user.email });
    return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), rl);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl);
  }

  const schema = z.object({
    case_id: z.union([z.string(), z.number()]).optional(),
    order_id: z.union([z.string(), z.number()]),
    case_type: z.string().trim().max(50),
    case_status: z.string().trim().max(50),
    refund_amount: z.union([z.string(), z.number()]).optional(),
    reason: z.string().trim().min(2).max(200),
    customer_note: z.string().trim().max(1000).optional(),
    admin_note: z.string().trim().max(1000).optional(),
    replacement_order_id: z.union([z.string(), z.number()]).optional(),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    await logAdminError("Validation failed", { route: "/api/admin/orders/support-cases/save", issues: parsed.error.issues });
    return applyRateLimitHeaders(respondZodError(parsed.error), rl);
  }

  const caseIdText = parsed.data.case_id == null ? "" : String(parsed.data.case_id).trim();
  const orderId = String(parsed.data.order_id).trim();
  if (!orderId) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Order id is required." }, { status: 400 }), rl);
  }

  const caseType = normalizeOrderSupportCaseType(parsed.data.case_type);
  const caseStatus = normalizeOrderSupportCaseStatus(parsed.data.case_status);
  if (!isOrderSupportCaseType(parsed.data.case_type)) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: `Unsupported support case type: ${parsed.data.case_type}` }, { status: 400 }),
      rl
    );
  }
  if (!isOrderSupportCaseStatus(parsed.data.case_status)) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: `Unsupported support case status: ${parsed.data.case_status}` }, { status: 400 }),
      rl
    );
  }

  const refundAmount = Number(parsed.data.refund_amount ?? 0);
  if (!Number.isFinite(refundAmount) || refundAmount < 0) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Refund amount must be zero or greater." }, { status: 400 }),
      rl
    );
  }

  const replacementOrderId = parsed.data.replacement_order_id == null ? "" : String(parsed.data.replacement_order_id).trim();
  if (replacementOrderId && replacementOrderId === orderId) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Replacement order id must be different from the original order." }, { status: 400 }),
      rl
    );
  }

  const admin = getSupabaseAdminClient();
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, user_id, total, status, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) {
    await logAdminError(orderErr, { route: "/api/admin/orders/support-cases/save", actor: user.email, order_id: orderId });
    return applyRateLimitHeaders(NextResponse.json({ error: orderErr.message }, { status: 400 }), rl);
  }
  if (!order) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Order not found" }, { status: 404 }), rl);
  }

  const payload = {
    order_id: orderId,
    user_id: order?.user_id == null ? null : String(order.user_id),
    case_type: caseType,
    case_status: caseStatus,
    refund_amount: refundAmount,
    reason: parsed.data.reason,
    customer_note: parsed.data.customer_note || null,
    admin_note: parsed.data.admin_note || null,
    replacement_order_id: replacementOrderId || null,
    resolved_at: isClosedOrderSupportCaseStatus(caseStatus) ? new Date().toISOString() : null,
  };

  let existingCase = null;
  if (caseIdText) {
    const { data, error } = await admin
      .from("order_support_cases")
      .select("id, order_id, case_type, case_status, refund_amount, reason, customer_note, admin_note, replacement_order_id, resolved_at")
      .eq("id", caseIdText)
      .maybeSingle();
    if (error) {
      await logAdminError(error, { route: "/api/admin/orders/support-cases/save", actor: user.email, case_id: caseIdText, stage: "load-case" });
      if (isMissingOrderSupportSchemaError(error.message)) {
        return applyRateLimitHeaders(
          NextResponse.json({ error: "Order support cases are unavailable until the support-case migration is applied." }, { status: 409 }),
          rl
        );
      }
      return applyRateLimitHeaders(NextResponse.json({ error: error.message }, { status: 400 }), rl);
    }
    if (!data) {
      return applyRateLimitHeaders(NextResponse.json({ error: "Support case not found" }, { status: 404 }), rl);
    }
    existingCase = data;
  }

  const writer = existingCase
    ? admin
        .from("order_support_cases")
        .update(payload)
        .eq("id", caseIdText)
        .select("*")
        .maybeSingle()
    : admin
        .from("order_support_cases")
        .insert({
          ...payload,
          created_by_user_id: user.id,
          created_by_email: user.email || null,
        })
        .select("*")
        .maybeSingle();

  const { data: savedCase, error: saveErr } = await writer;
  if (saveErr) {
    await logAdminError(saveErr, {
      route: "/api/admin/orders/support-cases/save",
      actor: user.email,
      order_id: orderId,
      case_id: caseIdText || null,
      case_type: caseType,
      case_status: caseStatus,
    });
    if (isMissingOrderSupportSchemaError(saveErr.message)) {
      return applyRateLimitHeaders(
        NextResponse.json({ error: "Order support cases are unavailable until the support-case migration is applied." }, { status: 409 }),
        rl
      );
    }
    return applyRateLimitHeaders(NextResponse.json({ error: saveErr.message }, { status: 400 }), rl);
  }

  await logAdminEvent({
    route: "/api/admin/orders/support-cases/save",
    actor: user.email,
    order_id: orderId,
    case_id: (savedCase?.id ?? caseIdText) || null,
    before_case_type: existingCase?.case_type,
    before_case_status: existingCase?.case_status,
    after_case_type: savedCase?.case_type ?? caseType,
    after_case_status: savedCase?.case_status ?? caseStatus,
    refund_amount: savedCase?.refund_amount ?? refundAmount,
    ok: true,
  });

  return applyRateLimitHeaders(
    NextResponse.json({
      ok: true,
      case: savedCase || {
        id: caseIdText || null,
        ...payload,
      },
    }),
    rl
  );
}
