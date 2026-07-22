import { NextResponse } from "next/server";
import { z } from "zod";
import {
  loadRiderRouteByToken,
  updateRouteStatusByToken,
  updateStopStatusByToken,
  verifyStopOtpByToken,
} from "@/lib/delivery/management";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { respondZodError } from "@/lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pinFromRequest = (req) => req.headers.get("x-rider-pin") || new URL(req.url).searchParams.get("pin") || "";
const send = (response, rl) => applyRateLimitHeaders(withNoStore(response), rl);

export async function GET(req, { params }) {
  const { token } = await params;
  const rl = await checkRateLimit({ request: req, id: `rider:route:get:${token.slice(0, 12)}`, limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return send(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  try {
    const result = await loadRiderRouteByToken(token, { pin: pinFromRequest(req) });
    return send(NextResponse.json({ ok: true, ...result }), rl);
  } catch (error) {
    return send(NextResponse.json({ error: error.message || "Unable to load route." }, { status: 403 }), rl);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["accept_route", "start_route"]), pin: z.string().trim().optional() }),
  z.object({
    action: z.literal("stop_status"),
    pin: z.string().trim().optional(),
    stopId: z.string().uuid(),
    status: z.enum(["en_route", "arrived", "failed", "returned", "skipped"]),
    failureReason: z.string().trim().optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("verify_otp"),
    pin: z.string().trim().optional(),
    stopId: z.string().uuid(),
    otp: z.string().trim().min(4).max(8),
    recipientType: z.enum(["customer", "family_member", "security", "staff", "other"]).optional(),
    recipientName: z.string().trim().min(2).max(120),
    deliveryNotes: z.string().trim().max(1000).optional(),
  }),
]);

export async function POST(req, { params }) {
  const { token } = await params;
  const rl = await checkRateLimit({ request: req, id: `rider:route:post:${token.slice(0, 12)}`, limit: 40, windowMs: 60_000 });
  if (!rl.allowed) return send(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  let body;
  try {
    body = await req.json();
  } catch {
    return send(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl);
  }
  const parsed = actionSchema.safeParse(body || {});
  if (!parsed.success) return send(respondZodError(parsed.error), rl);

  const pin = parsed.data.pin || "";
  const context = {
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") || "",
  };
  try {
    if (parsed.data.action === "accept_route") {
      const result = await updateRouteStatusByToken({ token, pin, status: "accepted", ...context });
      return send(NextResponse.json({ ok: true, ...result }), rl);
    }
    if (parsed.data.action === "start_route") {
      const result = await updateRouteStatusByToken({ token, pin, status: "in_progress", ...context });
      return send(NextResponse.json({ ok: true, ...result }), rl);
    }
    if (parsed.data.action === "stop_status") {
      const result = await updateStopStatusByToken({ token, pin, stopId: parsed.data.stopId, status: parsed.data.status, failureReason: parsed.data.failureReason, notes: parsed.data.notes, ...context });
      return send(NextResponse.json({ ok: true, ...result }), rl);
    }
    const result = await verifyStopOtpByToken({
      token,
      pin,
      stopId: parsed.data.stopId,
      otp: parsed.data.otp,
      recipientType: parsed.data.recipientType,
      recipientName: parsed.data.recipientName,
      deliveryNotes: parsed.data.deliveryNotes,
      ...context,
    });
    return send(NextResponse.json({ ok: true, ...result }), rl);
  } catch (error) {
    return send(NextResponse.json({ error: error.message || "Rider action failed." }, { status: 400 }), rl);
  }
}
