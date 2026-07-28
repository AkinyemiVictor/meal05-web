import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const send = (body, status, rl) => applyRateLimitHeaders(withNoStore(NextResponse.json(body, { status })), rl);

export async function GET(request, { params }) {
  const rl = await checkRateLimit({ request, id: "payments:get", limit: 120, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);
  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return send({ error: "Forbidden origin" }, 403, rl);
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  const user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return send({ error: authErr.message }, 401, rl);
  if (!user) return send({ error: "Not authenticated" }, 401, rl);

  const paymentId = Number((await params)?.paymentId);
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0) return send({ error: "Payment not found." }, 404, rl);

  const { data, error } = await admin
    .from("payments")
    .select("id, reference, amount, currency, status, purpose, order_id, wallet_topup_id, provider_code, customer_submitted_at, verified_at, rejected_at, rejection_reason, expires_at, created_at")
    .eq("id", paymentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return send({ error: error.message || "Unable to load payment." }, 500, rl);
  if (!data) return send({ error: "Payment not found." }, 404, rl);
  return send({ payment: data }, 200, rl);
}
