import { NextResponse } from "next/server";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { requireAdminApiUser } from "@/lib/admin-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const send = (body, status, rl) => applyRateLimitHeaders(withNoStore(NextResponse.json(body, { status })), rl);

export async function GET(request) {
  const rl = await checkRateLimit({ request, id: "admin:payments:list", limit: 90, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);
  const auth = await requireAdminApiUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const purpose = url.searchParams.get("purpose");
  let query = getSupabaseAdminClient()
    .from("payments")
    .select("id, reference, user_id, order_id, wallet_topup_id, purpose, provider_code, amount, currency, status, payer_account_name, payer_bank_name, customer_transaction_reference, customer_submitted_at, verified_at, rejected_at, rejection_reason, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status && status !== "all") query = query.eq("status", status);
  if (purpose && purpose !== "all") query = query.eq("purpose", purpose);
  const { data, error } = await query;
  if (error) return send({ error: error.message || "Unable to load payments." }, 500, rl);
  return send({ payments: data || [] }, 200, rl);
}
