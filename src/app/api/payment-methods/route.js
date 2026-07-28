import { NextResponse } from "next/server";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { loadPaymentProviders, sanitizeProvider } from "@/lib/payments/provider-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const send = (body, status, rl) => applyRateLimitHeaders(withNoStore(NextResponse.json(body, { status })), rl);

export async function GET(request) {
  const rl = await checkRateLimit({ request, id: "payment-methods:get", limit: 120, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);
  try {
    const providers = await loadPaymentProviders(getSupabaseAdminClient());
    return send(
      {
        methods: providers.map((provider) => sanitizeProvider(provider, "checkout")),
        walletTopupMethods: providers.map((provider) => sanitizeProvider(provider, "wallet_topup")),
      },
      200,
      rl
    );
  } catch (error) {
    return send({ error: error?.message || "Unable to load payment methods." }, 500, rl);
  }
}
