import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { applyVerifiedPaystackWalletTopup } from "@/lib/payments/paystack-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (value) => String(value ?? "").trim();
const errorJson = (message, status, rl) =>
  applyRateLimitHeaders(NextResponse.json({ error: message }, { status }), rl);

export async function POST(request, { params }) {
  let rl = await checkRateLimit({ request, id: "wallet:topups:verify:ip", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return errorJson("Too many requests", 429, rl);

  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return errorJson("Forbidden origin", 403, rl);

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  const user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return errorJson(authErr.message, 401, rl);
  if (!user) return errorJson("Not authenticated", 401, rl);

  const userRl = await checkRateLimit({ request, id: `wallet:topups:verify:user:${user.id}`, limit: 20, windowMs: 60_000 });
  if (!userRl.allowed) return errorJson("Too many requests", 429, userRl);
  rl = userRl;

  const id = text((await params)?.id);
  if (!id) return errorJson("Missing top-up id", 400, rl);

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = await applyVerifiedPaystackWalletTopup({
    topupId: id,
    reference: text(body?.reference),
    userId: user.id,
  });

  if (!result.ok) {
    return applyRateLimitHeaders(NextResponse.json(
      { verified: Boolean(result.verified), error: result.error },
      { status: result.status || 400 }
    ), rl);
  }

  return applyRateLimitHeaders(NextResponse.json(result.body, { status: result.status || 200 }), rl);
}
