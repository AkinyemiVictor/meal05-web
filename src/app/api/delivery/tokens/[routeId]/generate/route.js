import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDispatchUser } from "@/lib/delivery/auth";
import { generateDeliveryAccessToken } from "@/lib/delivery/management";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { respondZodError } from "@/lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  expiresInHours: z.number().min(1).max(168).optional(),
  requirePin: z.boolean().optional(),
});
const send = (response, rl) => applyRateLimitHeaders(withNoStore(response), rl);

export async function POST(req, { params }) {
  const rl = await checkRateLimit({ request: req, id: "delivery:tokens:generate", limit: 30, windowMs: 60_000 });
  const auth = await requireDispatchUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);
  if (!rl.allowed) return send(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);

  const { routeId } = await params;
  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) return send(respondZodError(parsed.error), rl);

  try {
    const result = await generateDeliveryAccessToken({
      routeId,
      actorUserId: auth.user.id,
      expiresInHours: parsed.data.expiresInHours,
      requirePin: parsed.data.requirePin !== false,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get("user-agent") || "",
    });
    const origin = new URL(req.url).origin;
    return send(
      NextResponse.json({
        ok: true,
        ...result,
        secureLink: `${origin}/rider/route/${result.token}`,
      }),
      rl
    );
  } catch (error) {
    return send(NextResponse.json({ error: error.message || "Unable to generate rider link." }, { status: 400 }), rl);
  }
}
