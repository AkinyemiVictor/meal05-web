import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import { issuePaystackReference } from "@/lib/payments/paystack-reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  orderId: z.union([z.string(), z.number()]),
});

const errorJson = (message, status, rl) =>
  applyRateLimitHeaders(NextResponse.json({ error: message }, { status }), rl);

export async function POST(request) {
  let rl = await checkRateLimit({ request, id: "paystack:session:ip", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return errorJson("Too many requests", 429, rl);

  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return errorJson("Forbidden origin", 403, rl);

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  let user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return errorJson(authErr.message, 401, rl);
  if (!user) return errorJson("Not authenticated", 401, rl);

  const userRl = await checkRateLimit({
    request,
    id: `paystack:session:user:${user.id}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!userRl.allowed) return errorJson("Too many requests", 429, userRl);
  rl = userRl;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("Invalid JSON payload", 400, rl);
  }

  const parsed = payloadSchema.safeParse(body || {});
  if (!parsed.success) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 }),
      rl
    );
  }

  const orderId = String(parsed.data.orderId).trim();
  if (!orderId) return errorJson("Missing orderId", 400, rl);

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, total, user_id, payment_status, status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return errorJson(orderErr.message || "Unable to load order", 500, rl);
  if (!order) return errorJson("Order not found", 404, rl);
  if (String(order.user_id || "") !== String(user.id || "")) return errorJson("Forbidden", 403, rl);

  const paymentStatus = String(order.payment_status || "").toLowerCase();
  if (paymentStatus === "paid") return errorJson("Order is already paid", 409, rl);

  const amountKobo = Math.max(0, Math.round((Number(order.total) || 0) * 100));
  const issued = await issuePaystackReference({
    orderId: order.id,
    userId: user.id,
    email: user.email || "",
    amountKobo,
  });

  return applyRateLimitHeaders(
    NextResponse.json(
      {
        reference: issued.reference,
        orderId: String(order.id),
        amountKobo,
        email: String(user.email || "").trim().toLowerCase(),
        expiresAt: issued.expiresAt,
      },
      { status: 200 }
    ),
    rl
  );
}
