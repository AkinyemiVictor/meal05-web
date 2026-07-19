import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errorJson = (message, status, rl) =>
  applyRateLimitHeaders(NextResponse.json({ error: message }, { status }), rl);

export async function GET(request, { params }) {
  let rl = await checkRateLimit({ request, id: "wallet:topups:get:ip", limit: 120, windowMs: 60_000 });
  if (!rl.allowed) return errorJson("Too many requests", 429, rl);

  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return errorJson("Forbidden origin", 403, rl);

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  const user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return errorJson(authErr.message, 401, rl);
  if (!user) return errorJson("Not authenticated", 401, rl);

  const id = String((await params)?.id || "").trim();
  if (!id) return errorJson("Missing top-up id", 400, rl);

  const { data, error } = await admin
    .from("wallet_topups")
    .select("id, provider, amount, currency_code, status, merchant_reference, provider_reference, authorization_url, failure_reason, created_at, updated_at, paid_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return errorJson(error.message || "Unable to load top-up.", 500, rl);
  if (!data) return errorJson("Top-up not found", 404, rl);

  return applyRateLimitHeaders(NextResponse.json({ topup: data }, { status: 200 }), rl);
}
