import { NextResponse } from "next/server";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { requireAdminApiUser } from "@/lib/admin-api-auth";
import { loadPaymentProviders } from "@/lib/payments/provider-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const send = (body, status, rl) => applyRateLimitHeaders(withNoStore(NextResponse.json(body, { status })), rl);

export async function GET(request) {
  const rl = await checkRateLimit({ request, id: "admin:payment-settings:get", limit: 90, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);
  const auth = await requireAdminApiUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);
  try {
    return send({ providers: await loadPaymentProviders(getSupabaseAdminClient()) }, 200, rl);
  } catch (error) {
    return send({ error: error?.message || "Unable to load payment settings." }, 500, rl);
  }
}
