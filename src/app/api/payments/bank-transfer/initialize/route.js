import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import {
  createPaymentReference,
  normalizeCurrency,
  normalizeProviderCode,
  paymentExpiryForPurpose,
  requireUsableProvider,
  sanitizeProvider,
} from "@/lib/payments/provider-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  orderId: z.union([z.string(), z.number()]),
  providerCode: z.string().trim().optional().default("moniepoint_transfer"),
});

const send = (body, status, rl) => applyRateLimitHeaders(withNoStore(NextResponse.json(body, { status })), rl);

async function getUser(request, admin) {
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return { response: { error: "Forbidden origin", status: 403 } };
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  const user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return { response: { error: authErr.message, status: 401 } };
  if (!user) return { response: { error: "Not authenticated", status: 401 } };
  return { user };
}

export async function POST(request) {
  let rl = await checkRateLimit({ request, id: "payments:bank-transfer:init:ip", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);

  const admin = getSupabaseAdminClient();
  const auth = await getUser(request, admin);
  if (auth.response) return send({ error: auth.response.error }, auth.response.status, rl);

  const userRl = await checkRateLimit({ request, id: `payments:bank-transfer:init:user:${auth.user.id}`, limit: 20, windowMs: 60_000 });
  if (!userRl.allowed) return send({ error: "Too many requests" }, 429, userRl);
  rl = userRl;

  let body;
  try {
    body = await request.json();
  } catch {
    return send({ error: "Invalid JSON payload" }, 400, rl);
  }
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) return send({ error: "Validation failed", issues: parsed.error.issues }, 400, rl);

  const providerCode = normalizeProviderCode(parsed.data.providerCode);
  let provider;
  try {
    provider = await requireUsableProvider(admin, providerCode, "checkout");
  } catch (error) {
    return send({ error: error.message, code: error.code || "PAYMENT_METHOD_DISABLED" }, error.status || 503, rl);
  }

  const orderId = Number(parsed.data.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return send({ error: "Order not found." }, 404, rl);

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, user_id, total, currency_code, payment_status, payment_reference")
    .eq("id", orderId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (orderError) return send({ error: orderError.message || "Unable to load order." }, 500, rl);
  if (!order) return send({ error: "Order not found." }, 404, rl);
  if (String(order.payment_status || "").toLowerCase() === "paid") return send({ error: "Order is already paid." }, 409, rl);

  const { data: existing, error: existingError } = await admin
    .from("payments")
    .select("id, reference, amount, currency, status, expires_at, provider_code")
    .eq("order_id", order.id)
    .eq("purpose", "order_payment")
    .not("status", "in", "(cancelled,rejected,expired,failed,refunded)")
    .maybeSingle();
  if (existingError) return send({ error: existingError.message || "Unable to load payment." }, 500, rl);

  let payment = existing;
  if (!payment) {
    const reference = createPaymentReference("order_payment");
    const expiresAt = paymentExpiryForPurpose("order_payment");
    const { data: inserted, error: insertError } = await admin
      .from("payments")
      .insert({
        order_id: order.id,
        user_id: auth.user.id,
        purpose: "order_payment",
        provider_code: providerCode,
        method: providerCode,
        status: "awaiting_transfer",
        amount: Number(order.total) || 0,
        currency: normalizeCurrency(order.currency_code),
        currency_code: normalizeCurrency(order.currency_code),
        reference,
        transaction_ref: reference,
        expires_at: expiresAt,
        metadata: { source: "bank_transfer_initialize" },
      })
      .select("id, reference, amount, currency, status, expires_at, provider_code")
      .single();
    if (insertError) return send({ error: insertError.message || "Unable to create payment." }, 500, rl);
    payment = inserted;
    await admin.from("orders").update({ payment_reference: reference, payment_method: providerCode, payment_status: "pending" }).eq("id", order.id);
  }

  return send({ payment, provider: sanitizeProvider(provider, "checkout") }, 201, rl);
}
