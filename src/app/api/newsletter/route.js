import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(254)
    .transform((value) => value.toLowerCase()),
});

const respond = (body, init, limit) =>
  applyRateLimitHeaders(NextResponse.json(body, init), limit);

export async function POST(request) {
  const limit = await checkRateLimit({
    request,
    id: "newsletter-subscribe",
    limit: 5,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return respond(
      { error: "Too many attempts. Please try again shortly." },
      { status: 429 },
      limit
    );
  }

  if (!isTrustedRequestOrigin(request)) {
    return respond({ error: "Request origin is not allowed." }, { status: 403 }, limit);
  }

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return respond(
        { error: parsed.error.issues[0]?.message || "Check your email and try again." },
        { status: 400 },
        limit
      );
    }

    const subscribedAt = new Date().toISOString();
    const { error } = await getSupabaseAdminClient()
      .from("newsletter_subscribers")
      .upsert(
        {
          email: parsed.data.email,
          status: "active",
          source: "website-footer",
          subscribed_at: subscribedAt,
          unsubscribed_at: null,
          updated_at: subscribedAt,
        },
        { onConflict: "email" }
      );

    if (error) throw error;

    return respond(
      { message: "Fresh Meal05 updates are on the way." },
      { status: 201 },
      limit
    );
  } catch (error) {
    console.error("Newsletter subscription failed", error);
    return respond(
      { error: "We couldn't subscribe you right now. Please try again." },
      { status: 500 },
      limit
    );
  }
}
