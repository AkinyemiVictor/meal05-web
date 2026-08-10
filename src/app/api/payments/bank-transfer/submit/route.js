import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { insertOrderStatusHistory } from "@/lib/order-status-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  paymentId: z.union([z.string(), z.number()]),
  payerAccountName: z.string().trim().min(2).max(120),
  payerBankName: z.string().trim().min(2).max(120),
  customerTransactionReference: z.string().trim().max(120).optional().default(""),
  exactAmountConfirmed: z.literal(true),
});

const send = (body, status, rl) => applyRateLimitHeaders(withNoStore(NextResponse.json(body, { status })), rl);

async function getUser(request, admin) {
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return { response: { error: "Forbidden origin", status: 403 } };
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  const user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return { response: { error: authErr.message, status: 401 } };
  if (!user) return { response: { error: "Not authenticated", status: 401 } };
  return { user };
}

export async function POST(request) {
  let rl = await checkRateLimit({ request, id: "payments:bank-transfer:submit:ip", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);

  const admin = getSupabaseAdminClient();
  const auth = await getUser(request, admin);
  if (auth.response) return send({ error: auth.response.error }, auth.response.status, rl);

  const userRl = await checkRateLimit({ request, id: `payments:bank-transfer:submit:user:${auth.user.id}`, limit: 20, windowMs: 60_000 });
  if (!userRl.allowed) return send({ error: "Too many requests" }, 429, userRl);
  rl = userRl;

  let body;
  try {
    body = await request.json();
  } catch {
    return send({ error: "Invalid JSON payload" }, 400, rl);
  }
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    const missingExactConfirmation = parsed.error.issues.some((issue) => issue.path?.[0] === "exactAmountConfirmed");
    return send(
      {
        error: missingExactConfirmation ? "Please confirm that you will transfer the exact amount." : "Payment submission details are incomplete.",
      },
      400,
      rl
    );
  }

  const paymentId = Number(parsed.data.paymentId);
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0) return send({ error: "Payment not found." }, 404, rl);

  const { data: payment, error: findError } = await admin
    .from("payments")
    .select("id, reference, user_id, amount, currency, status, purpose, order_id, wallet_topup_id, provider_code, verified_at")
    .eq("id", paymentId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (findError) return send({ error: findError.message || "Unable to load payment." }, 500, rl);
  if (!payment) return send({ error: "Payment not found." }, 404, rl);
  if (["verified", "success"].includes(String(payment.status || "").toLowerCase())) return send({ error: "Payment already verified." }, 409, rl);
  if (!["awaiting_transfer", "submitted", "pending"].includes(String(payment.status || "").toLowerCase())) {
    return send({ error: "Payment cannot be submitted from its current status." }, 409, rl);
  }

  const { data: updated, error: updateError } = await admin
    .from("payments")
    .update({
      status: "submitted",
      payer_account_name: parsed.data.payerAccountName,
      payer_bank_name: parsed.data.payerBankName,
      customer_transaction_reference: parsed.data.customerTransactionReference || null,
      customer_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id)
    .eq("user_id", auth.user.id)
    .select("id, reference, amount, currency, status, purpose, order_id, wallet_topup_id, provider_code, customer_submitted_at")
    .single();
  if (updateError) return send({ error: updateError.message || "Unable to submit payment." }, 500, rl);

  if (payment.purpose === "order_payment" && payment.order_id) {
    const { data: order, error: orderUpdateError } = await admin
      .from("orders")
      .update({ payment_status: "awaiting_confirmation", updated_at: new Date().toISOString() })
      .eq("id", payment.order_id)
      .eq("user_id", auth.user.id)
      .select("id, status")
      .maybeSingle();
    if (orderUpdateError || !order) {
      return send({ error: orderUpdateError?.message || "Payment was submitted, but its order could not be updated." }, 500, rl);
    }
    // Reuse the existing audit table for the customer-submission event. The
    // order state stays pending until an administrator confirms the transfer.
    await insertOrderStatusHistory(admin, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: order.status,
      changedBy: auth.user.id,
      note: "Payment submitted; awaiting administrator confirmation",
    });
    const { error: clearCartError } = await admin
      .from("cart_items")
      .delete()
      .eq("user_id", auth.user.id);
    if (clearCartError) {
      return send({ error: clearCartError.message || "Payment was submitted, but the cart could not be cleared." }, 500, rl);
    }
  }

  return send(
    {
      payment: updated,
      heading: "Payment submitted",
      message: "We are confirming your payment. You will receive a notification upon confirmation.",
    },
    200,
    rl
  );
}
