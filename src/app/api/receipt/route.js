import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";
import { sendOrderReceiptEmail } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jsonWithRateLimit = (payload, status, rateLimitInfo) =>
  applyRateLimitHeaders(NextResponse.json(payload, { status }), rateLimitInfo);

export async function POST(request) {
  const rl = await checkRateLimit({ request, id: "receipt:send", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return jsonWithRateLimit({ error: "Too many requests" }, 429, rl);
  if (!isTrustedRequestOrigin(request)) return jsonWithRateLimit({ error: "Forbidden origin" }, 403, rl);

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr || !user) {
    return jsonWithRateLimit({ error: authErr?.message || "Not authenticated" }, 401, rl);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonWithRateLimit({ error: "Invalid JSON payload" }, 400, rl);
  }

  const order = payload?.order || payload || {};
  const to = String(user?.email || "").trim();
  if (!to) {
    return jsonWithRateLimit({ error: "Authenticated user email is required" }, 400, rl);
  }

  try {
    await sendOrderReceiptEmail({ to, order });
    return jsonWithRateLimit({ status: "queued", to }, 202, rl);
  } catch (error) {
    console.warn("[receipt] Send error", error);
    return jsonWithRateLimit({ status: "failed" }, 502, rl);
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
}
