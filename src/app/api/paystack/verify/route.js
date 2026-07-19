import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { applyVerifiedPaystackPayment } from "@/lib/payments/paystack-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normaliseText = (value) => String(value ?? "").trim();

const errorJson = (message, status, rl) =>
  applyRateLimitHeaders(NextResponse.json({ error: message }, { status }), rl);

export async function POST(req) {
  let rl = await checkRateLimit({ request: req, id: "paystack:verify:ip", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return errorJson("Too many requests", 429, rl);

  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(req, admin);
  if (!originTrust.trusted) return errorJson("Forbidden origin", 403, rl);

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  let user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return errorJson(authErr.message, 401, rl);
  if (!user) return errorJson("Not authenticated", 401, rl);

  const userRl = await checkRateLimit({
    request: req,
    id: `paystack:verify:user:${user.id}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!userRl.allowed) return errorJson("Too many requests", 429, userRl);
  rl = userRl;

  try {
    const body = await req.json();
    const reference = normaliseText(body?.reference);
    const orderId = normaliseText(body?.orderId);
    if (!reference || !orderId) {
      return errorJson("Missing reference or orderId", 400, rl);
    }

    const result = await applyVerifiedPaystackPayment({ reference, providedOrderId: orderId, userId: user.id });
    if (!result.ok) {
      return applyRateLimitHeaders(NextResponse.json(
        {
          verified: Boolean(result.verified),
          stockUpdated: result.stockUpdated ?? false,
          error: result.error,
        },
        { status: result.status || 400 }
      ), rl);
    }
    return applyRateLimitHeaders(NextResponse.json(result.body, { status: result.status || 200 }), rl);
  } catch (error) {
    return errorJson(error?.message || "Server error", 500, rl);
  }
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const reference = normaliseText(url.searchParams.get("reference"));
    const providedOrderId = normaliseText(url.searchParams.get("orderId"));

    if (!reference) {
      return NextResponse.redirect(new URL("/checkout/failure?reason=Missing+reference", url.origin));
    }

    const result = await applyVerifiedPaystackPayment({ reference, providedOrderId });
    if (!result.ok) {
      const reason = encodeURIComponent(result.error || "Verification failed");
      return NextResponse.redirect(new URL(`/checkout/failure?reason=${reason}`, url.origin));
    }

    return NextResponse.redirect(new URL("/checkout/success", url.origin));
  } catch (error) {
    const url = new URL(req.url);
    return NextResponse.redirect(
      new URL(`/checkout/failure?reason=${encodeURIComponent(error?.message || "Server error")}`, url.origin)
    );
  }
}
