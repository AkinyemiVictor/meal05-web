import { NextResponse } from "next/server";
import { requireCustomerUser } from "@/lib/delivery/auth";
import { buildCustomerRiderContact } from "@/lib/delivery/contact-window";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const send = (response, rl) => applyRateLimitHeaders(withNoStore(response), rl);

const unavailable = (rl) => send(NextResponse.json({ available: false }, { status: 200 }), rl);

const toInt = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export async function GET(req, { params }) {
  const rl = await checkRateLimit({ request: req, id: "orders:delivery-contact:get", limit: 90, windowMs: 60_000 });
  const auth = await requireCustomerUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);
  if (!rl.allowed) return send(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);

  const { orderId } = await params;
  const id = toInt(orderId);
  if (!id) return send(NextResponse.json({ error: "Order not found." }, { status: 404 }), rl);

  try {
    const admin = getSupabaseAdminClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, order_reference, user_id, status, delivery_status")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) return send(NextResponse.json({ error: "Order not found." }, { status: 404 }), rl);

    const { data: stops, error: stopError } = await admin
      .from("delivery_route_stops")
      .select(`
        id, route_id, order_id, status,
        delivery_routes(
          id, status, actual_start_time, completed_at,
          delivery_partners(id, full_name, name, phone, contact_phone, is_active)
        )
      `)
      .eq("order_id", id)
      .limit(5);

    if (stopError) throw stopError;

    const rows = Array.isArray(stops) ? stops : [];
    const contact = rows
      .map((stop) => buildCustomerRiderContact({ order, stop }))
      .find((entry) => entry.available);

    if (!contact?.available) return unavailable(rl);
    return send(NextResponse.json(contact, { status: 200 }), rl);
  } catch {
    return unavailable(rl);
  }
}
