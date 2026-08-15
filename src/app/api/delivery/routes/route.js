import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDispatchUser } from "@/lib/delivery/auth";
import { createDeliveryRoute, loadDispatchDashboard } from "@/lib/delivery/management";
import { checkRateLimit, applyRateLimitHeaders, getClientIp } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { respondZodError } from "@/lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routeSchema = z.object({
  orderIds: z.array(z.union([z.string(), z.number()])).min(1),
  deliveryPartnerId: z.string().uuid().optional().nullable(),
  vehicleType: z.enum(["motorcycle", "napep", "korope", "car", "van", "other"]).optional().nullable(),
  plannedStartTime: z.string().trim().optional().nullable(),
  pickupLocation: z.string().trim().max(300).optional().nullable(),
  agreedPartnerPayment: z.union([z.string(), z.number()]).optional().nullable(),
  otherDeliveryCost: z.union([z.string(), z.number()]).optional().nullable(),
  packages: z.array(z.object({
    orderId: z.union([z.string(), z.number()]),
    packageCount: z.number().int().min(1).max(50),
  }).strict()).max(30).optional().default([]),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const send = (response, rl) => applyRateLimitHeaders(withNoStore(response), rl);

export async function GET(req) {
  const rl = await checkRateLimit({ request: req, id: "delivery:routes:get", limit: 90, windowMs: 60_000 });
  const auth = await requireDispatchUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);
  if (!rl.allowed) return send(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);

  const data = await loadDispatchDashboard();
  return send(NextResponse.json(data), rl);
}

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "delivery:routes:create", limit: 30, windowMs: 60_000 });
  const auth = await requireDispatchUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);
  if (!rl.allowed) return send(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);

  let body;
  try {
    body = await req.json();
  } catch {
    return send(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl);
  }

  const parsed = routeSchema.safeParse(body || {});
  if (!parsed.success) return send(respondZodError(parsed.error), rl);

  try {
    const result = await createDeliveryRoute({
      actorUserId: auth.user.id,
      ...parsed.data,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get("user-agent") || "",
    });
    const origin = new URL(req.url).origin;
    const assignment = result?.assignment?.token
      ? {
          ...result.assignment,
          stopCount: Array.isArray(result.stops) ? result.stops.length : null,
          secureLink: `${origin}/rider/route/${result.assignment.token}`,
        }
      : result?.assignment || null;
    return send(NextResponse.json({ ok: true, ...result, assignment }), rl);
  } catch (error) {
    return send(NextResponse.json({ error: error.message || "Unable to create route." }, { status: 400 }), rl);
  }
}
