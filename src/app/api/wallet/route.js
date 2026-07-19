import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { loadWalletSnapshot } from "@/lib/wallet/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errorJson = (message, status, rl) =>
  applyRateLimitHeaders(NextResponse.json({ error: message }, { status }), rl);

export async function GET(request) {
  let rl = await checkRateLimit({ request, id: "wallet:get:ip", limit: 120, windowMs: 60_000 });
  if (!rl.allowed) return errorJson("Too many requests", 429, rl);

  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return errorJson("Forbidden origin", 403, rl);

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  const user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return errorJson(authErr.message, 401, rl);
  if (!user) return errorJson("Not authenticated", 401, rl);

  const userRl = await checkRateLimit({ request, id: `wallet:get:user:${user.id}`, limit: 60, windowMs: 60_000 });
  if (!userRl.allowed) return errorJson("Too many requests", 429, userRl);
  rl = userRl;

  try {
    const snapshot = await loadWalletSnapshot(admin, user.id);
    return applyRateLimitHeaders(NextResponse.json(snapshot, { status: 200 }), rl);
  } catch (error) {
    return errorJson(error?.message || "Unable to load Meal05 Balance.", 500, rl);
  }
}
