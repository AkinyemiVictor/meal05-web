import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { renderReceiptHtml } from "@/lib/email-templates";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM_EMAIL = process.env.RECEIPT_FROM_EMAIL || "no-reply@meal05.local";
const FROM_NAME = process.env.RECEIPT_FROM_NAME || "Meal05";
const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.RESEND_API_TOKEN;

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

  const subject = `Your Meal05 receipt - ${order?.orderId ?? "Order"}`;
  const origin = new URL(request.url).origin;
  const html = renderReceiptHtml(order, { baseUrl: origin });

  // Allow local verification without outbound provider config.
  if (!RESEND_API_KEY) {
    return jsonWithRateLimit({ status: "queued-local", to, subject }, 202, rl);
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [to],
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const errText = await safeText(resp);
      console.warn("[receipt] Resend API error:", resp.status, errText);
      return jsonWithRateLimit({ status: "failed", code: resp.status }, 502, rl);
    }

    const data = await resp.json().catch(() => ({}));
    return jsonWithRateLimit({ status: "queued", id: data?.id ?? null }, 202, rl);
  } catch (error) {
    console.warn("[receipt] Send error", error);
    return jsonWithRateLimit({ status: "failed" }, 502, rl);
  }
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
}
