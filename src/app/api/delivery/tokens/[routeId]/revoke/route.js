import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDispatchUser } from "@/lib/delivery/auth";
import { revokeDeliveryAccessTokens } from "@/lib/delivery/management";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { respondZodError } from "@/lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  reason: z.string().trim().min(3).max(300),
});
const send = (response, rl) => applyRateLimitHeaders(withNoStore(response), rl);

export async function POST(req, { params }) {
  const rl = await checkRateLimit({ request: req, id: "delivery:tokens:revoke", limit: 30, windowMs: 60_000 });
  const auth = await requireDispatchUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);
  if (!rl.allowed) return send(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  const { routeId } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return send(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl);
  }
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) return send(respondZodError(parsed.error), rl);
  try {
    const result = await revokeDeliveryAccessTokens({
      routeId,
      actorUserId: auth.user.id,
      reason: parsed.data.reason,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get("user-agent") || "",
    });
    return send(NextResponse.json({ ok: true, ...result }), rl);
  } catch (error) {
    return send(NextResponse.json({ error: error.message || "Unable to revoke rider link." }, { status: 400 }), rl);
  }
}
