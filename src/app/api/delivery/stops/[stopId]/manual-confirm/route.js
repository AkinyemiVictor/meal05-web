import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDispatchUser } from "@/lib/delivery/auth";
import { manuallyConfirmStop } from "@/lib/delivery/management";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { respondZodError } from "@/lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  reason: z.string().trim().min(5).max(500),
  recipientType: z.enum(["customer", "family_member", "security", "staff", "other"]).optional(),
  recipientName: z.string().trim().min(2).max(120).optional(),
  deliveryNotes: z.string().trim().max(1000).optional(),
});
const send = (response, rl) => applyRateLimitHeaders(withNoStore(response), rl);

export async function POST(req, { params }) {
  const rl = await checkRateLimit({ request: req, id: "delivery:stops:manual-confirm", limit: 20, windowMs: 60_000 });
  const auth = await requireDispatchUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);
  if (!rl.allowed) return send(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  const { stopId } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return send(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl);
  }
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) return send(respondZodError(parsed.error), rl);
  try {
    const result = await manuallyConfirmStop({
      stopId,
      actorUserId: auth.user.id,
      ...parsed.data,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get("user-agent") || "",
    });
    return send(NextResponse.json({ ok: true, ...result }), rl);
  } catch (error) {
    return send(NextResponse.json({ error: error.message || "Unable to manually confirm delivery." }, { status: 400 }), rl);
  }
}
