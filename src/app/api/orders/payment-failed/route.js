import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";
import { logAdminError, logAdminEvent } from "@/lib/api/log";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status, rl) => applyRateLimitHeaders(NextResponse.json(body, { status }), rl);

const schema = z.object({
  orderId: z.union([z.string(), z.number()]),
  reason: z.string().max(300).optional(),
});

const getAuthenticatedUser = async (request, admin) => {
  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user: cookieUser },
    error: authErr,
  } = await auth.auth.getUser();
  if (cookieUser) return { user: cookieUser, error: null };

  const header = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) return { user: null, error: authErr };

  try {
    const { data, error } = await admin.auth.getUser(token);
    return { user: error ? null : data?.user || null, error };
  } catch (error) {
    return { user: null, error };
  }
};

export async function POST(request) {
  const rl = await checkRateLimit({ request, id: "orders:payment-failed", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return json({ error: "Too many requests" }, 429, rl);
  if (!isTrustedRequestOrigin(request)) return json({ error: "Forbidden origin" }, 403, rl);

  const admin = getSupabaseAdminClient();
  const { user, error: authErr } = await getAuthenticatedUser(request, admin);
  if (authErr && !user) return json({ error: authErr.message || "Not authenticated" }, 401, rl);
  if (!user) return json({ error: "Not authenticated" }, 401, rl);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON payload" }, 400, rl);
  }

  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.issues }, 400, rl);
  }

  const orderId = String(parsed.data.orderId || "").trim();
  if (!orderId) return json({ error: "Missing orderId" }, 400, rl);

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, user_id, payment_status, status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return json({ error: orderErr.message || "Unable to load order" }, 500, rl);
  if (!order) return json({ error: "Order not found" }, 404, rl);
  if (String(order.user_id || "") !== String(user.id || "")) return json({ error: "Forbidden" }, 403, rl);

  const paymentStatus = String(order.payment_status || "").toLowerCase();
  if (paymentStatus === "paid") {
    return json({ error: "Order is already paid" }, 409, rl);
  }

  const patch = { payment_status: "failed", status: "payment_failed" };
  const { data: updated, error: updateErr } = await admin
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .neq("payment_status", "paid")
    .select("id, status, payment_status")
    .maybeSingle();

  if (updateErr) {
    await logAdminError(updateErr, { route: "/api/orders/payment-failed", order_id: orderId, user_id: user.id });
    return json({ error: updateErr.message || "Unable to mark payment failed" }, 500, rl);
  }

  await logAdminEvent({
    route: "/api/orders/payment-failed",
    order_id: orderId,
    user_id: user.id,
    reason: parsed.data.reason || undefined,
  });

  return json({ ok: true, order: updated || { id: orderId, ...patch } }, 200, rl);
}
