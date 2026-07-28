import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { withNoStore } from "@/lib/api/no-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errorJson = (message, status, rl) =>
  applyRateLimitHeaders(withNoStore(NextResponse.json({ error: message }, { status })), rl);

export async function GET(request) {
  let rl = await checkRateLimit({ request, id: "wallet:transactions:ip", limit: 120, windowMs: 60_000 });
  if (!rl.allowed) return errorJson("Too many requests", 429, rl);

  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return errorJson("Forbidden origin", 403, rl);

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  const user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return errorJson(authErr.message, 401, rl);
  if (!user) return errorJson("Not authenticated", 401, rl);

  const { data, error } = await admin
    .from("wallet_transactions")
    .select("id, amount, type, reason, order_id, refund_id, wallet_topup_id, provider, provider_reference, external_reference, note, created_at, currency_code")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return errorJson(error.message || "Unable to load transactions.", 500, rl);
  return applyRateLimitHeaders(withNoStore(NextResponse.json({ transactions: data || [] }, { status: 200 })), rl);
}
