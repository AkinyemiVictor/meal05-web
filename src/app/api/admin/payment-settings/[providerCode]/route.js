import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { requireAdminApiUser } from "@/lib/admin-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  display_name: z.string().trim().min(2).max(120).optional(),
  is_active: z.boolean().optional(),
  is_recommended: z.boolean().optional(),
  checkout_enabled: z.boolean().optional(),
  wallet_topup_enabled: z.boolean().optional(),
  display_order: z.number().int().min(1).max(1000).optional(),
  bank_name: z.string().trim().max(120).nullable().optional(),
  account_name: z.string().trim().max(160).nullable().optional(),
  account_number: z.string().trim().max(40).nullable().optional(),
  logo_url: z.string().trim().max(500).nullable().optional(),
  customer_notice: z.string().trim().max(500).nullable().optional(),
});
const send = (body, status, rl) => applyRateLimitHeaders(withNoStore(NextResponse.json(body, { status })), rl);

export async function PATCH(request, { params }) {
  const rl = await checkRateLimit({ request, id: "admin:payment-settings:patch", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);
  const auth = await requireAdminApiUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);
  const providerCode = String((await params)?.providerCode || "").trim();
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return send({ error: "Validation failed", issues: parsed.error.issues }, 400, rl);
  if (!Object.keys(parsed.data).length) return send({ error: "No settings provided." }, 400, rl);

  const patch = { ...parsed.data, updated_at: new Date().toISOString() };
  const { data, error } = await getSupabaseAdminClient()
    .from("payment_provider_settings")
    .update(patch)
    .eq("code", providerCode)
    .select("*")
    .single();
  if (error) return send({ error: error.message || "Unable to update payment setting." }, 409, rl);
  return send({ provider: data }, 200, rl);
}
