import { NextResponse } from "next/server";
import { z } from "zod";

import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";
import { logAdminEvent } from "@/lib/api/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  eventType: z.enum(["http_error", "network_error", "reconciliation_failed", "reconciliation_recovered", "slow_response"]),
  endpoint: z.string().trim().min(1).max(160).regex(/^\/api\//),
  stage: z.string().trim().min(1).max(80),
  requestId: z.string().trim().max(100).optional().default(""),
  errorCode: z.string().trim().max(40).optional().default(""),
  status: z.number().int().min(0).max(599).nullable().optional(),
  durationMs: z.number().int().min(0).max(300_000).nullable().optional(),
  attempts: z.number().int().min(1).max(5).nullable().optional(),
  online: z.boolean().nullable().optional(),
  cfRay: z.string().trim().max(100).optional().default(""),
}).strict();

export async function POST(request) {
  const rl = await checkRateLimit({ request, id: "checkout-events", limit: 12, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(withNoStore(NextResponse.json({ error: "Too many requests" }, { status: 429 })), rl);
  }
  if (!isTrustedRequestOrigin(request)) {
    return applyRateLimitHeaders(withNoStore(NextResponse.json({ error: "Forbidden origin" }, { status: 403 })), rl);
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return applyRateLimitHeaders(withNoStore(NextResponse.json({ error: "Invalid event" }, { status: 400 })), rl);
  }

  await logAdminEvent({
    route: "/api/checkout-events",
    stage: parsed.data.stage,
    action: `checkout_client_${parsed.data.eventType}`,
    request_id: parsed.data.requestId || null,
    endpoint: parsed.data.endpoint,
    error_code: parsed.data.errorCode || null,
    status: parsed.data.status ?? null,
    duration_ms: parsed.data.durationMs ?? null,
    attempts: parsed.data.attempts ?? null,
    online: parsed.data.online ?? null,
    cf_ray: parsed.data.cfRay || null,
  });

  return applyRateLimitHeaders(withNoStore(new NextResponse(null, { status: 202 })), rl);
}
