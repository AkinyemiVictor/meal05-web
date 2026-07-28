import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const send = (body, status, rl) => applyRateLimitHeaders(withNoStore(NextResponse.json(body, { status })), rl);

export async function POST(request, { params }) {
  let rl = await checkRateLimit({ request, id: "orders:pay-with-wallet:ip", limit: 40, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);
  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return send({ error: "Forbidden origin" }, 403, rl);
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  const user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return send({ error: authErr.message }, 401, rl);
  if (!user) return send({ error: "Not authenticated" }, 401, rl);

  const userRl = await checkRateLimit({ request, id: `orders:pay-with-wallet:user:${user.id}`, limit: 12, windowMs: 60_000 });
  if (!userRl.allowed) return send({ error: "Too many requests" }, 429, userRl);
  rl = userRl;

  const orderId = Number((await params)?.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return send({ error: "Order not found." }, 404, rl);
  const idempotencyKey = request.headers.get("Idempotency-Key") || request.headers.get("x-idempotency-key") || `wallet:order:${orderId}:${user.id}`;
  const { data, error } = await admin.rpc("debit_wallet_for_order", {
    p_order_id: orderId,
    p_user_id: user.id,
    p_idempotency_key: String(idempotencyKey).slice(0, 180),
  });
  if (error) {
    return send(
      { error: error.message || "Unable to pay with Meal05 Wallet." },
      /insufficient/i.test(error.message || "") ? 402 : 409,
      rl
    );
  }
  return send({ ok: true, result: data }, 200, rl);
}
