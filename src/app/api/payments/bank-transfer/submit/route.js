import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { isExpiredPaymentResult, PAYMENT_EXPIRED_CODE, PAYMENT_EXPIRED_MESSAGE } from "@/lib/payments/manual-payment-server";

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
        error: missingExactConfirmation ? "Please confirm that you transferred the exact amount." : "Payment submission details are incomplete.",
      },
      400,
      rl
    );
  }

  const paymentId = Number(parsed.data.paymentId);
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0) return send({ error: "Payment not found." }, 404, rl);

  const { data: result, error: submitError } = await admin.rpc("submit_manual_payment", {
    p_payment_id: paymentId,
    p_user_id: auth.user.id,
    p_payer_account_name: parsed.data.payerAccountName,
    p_payer_bank_name: parsed.data.payerBankName,
    p_customer_transaction_reference: parsed.data.customerTransactionReference || null,
    p_exact_amount_confirmed: parsed.data.exactAmountConfirmed,
  });
  if (submitError) {
    const message = submitError.message || "Unable to submit payment.";
    const status = /not found/i.test(message) ? 404 : /already verified|cannot be submitted|already paid|cancelled/i.test(message) ? 409 : 400;
    return send({ error: message }, status, rl);
  }
  if (isExpiredPaymentResult(result)) {
    return send(
      { error: result?.error || PAYMENT_EXPIRED_MESSAGE, code: PAYMENT_EXPIRED_CODE },
      410,
      rl
    );
  }

  return send(
    {
      payment: result?.payment || null,
      alreadyProcessed: result?.already_processed === true,
      heading: "Transfer submitted",
      message: "We are confirming your transfer. You will receive a notification once your payment has been confirmed.",
    },
    200,
    rl
  );
}
