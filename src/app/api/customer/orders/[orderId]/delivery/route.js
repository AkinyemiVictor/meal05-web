import { NextResponse } from "next/server";
import { requireCustomerUser } from "@/lib/delivery/auth";
import { loadCustomerDelivery } from "@/lib/delivery/management";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const send = (response, rl) => applyRateLimitHeaders(withNoStore(response), rl);

export async function GET(req, { params }) {
  const rl = await checkRateLimit({ request: req, id: "customer:delivery:get", limit: 90, windowMs: 60_000 });
  const auth = await requireCustomerUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);
  if (!rl.allowed) return send(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);

  const { orderId } = await params;
  try {
    const result = await loadCustomerDelivery(orderId, auth.user.id);
    return send(NextResponse.json({ ok: true, ...result }), rl);
  } catch (error) {
    return send(NextResponse.json({ error: error.message || "Delivery not found." }, { status: 404 }), rl);
  }
}
