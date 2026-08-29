import { NextResponse } from "next/server";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { requireAdminApiUser } from "@/lib/admin-api-auth";
import { isExpiredPaymentResult, PAYMENT_EXPIRED_CODE, PAYMENT_EXPIRED_MESSAGE } from "@/lib/payments/manual-payment-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const send = (body, status, rl) => applyRateLimitHeaders(withNoStore(NextResponse.json(body, { status })), rl);

export async function POST(request, { params }) {
  const rl = await checkRateLimit({ request, id: "admin:payments:verify", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);
  const auth = await requireAdminApiUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);
  const paymentId = Number((await params)?.paymentId);
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0) return send({ error: "Payment not found." }, 404, rl);
  const { data, error } = await getSupabaseAdminClient().rpc("verify_manual_payment", {
    p_payment_id: paymentId,
    p_administrator_id: auth.user.id,
  });
  if (error) return send({ error: error.message || "Unable to verify payment." }, 409, rl);
  if (isExpiredPaymentResult(data)) {
    return send({ error: data?.error || PAYMENT_EXPIRED_MESSAGE, code: PAYMENT_EXPIRED_CODE }, 409, rl);
  }
  return send({ ok: true, result: data }, 200, rl);
}
