import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";
import { respondZodError } from "@/lib/api/validate";
import { isMissingPromoCodeSchemaError, validatePromoCode } from "@/lib/promo-codes";
import { getDefaultMarket } from "@/lib/market-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const rl = await checkRateLimit({ request, id: "promo-codes:validate", limit: 90, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  }

  if (!isTrustedRequestOrigin(request)) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden origin" }, { status: 403 }), rl);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }), rl);
  }

  const schema = z.object({
    code: z.string().trim().max(64),
    subtotal: z.number().nonnegative().max(1_000_000_000),
    items_count: z.number().int().nonnegative().max(10_000).optional().default(0),
    delivery_fee: z.number().nonnegative().max(1_000_000_000).optional().default(0),
  });
  const parsed = schema.safeParse(payload || {});
  if (!parsed.success) {
    return applyRateLimitHeaders(respondZodError(parsed.error), rl);
  }

  try {
    const market = await getDefaultMarket();
    const result = await validatePromoCode({
      admin: getSupabaseAdminClient(),
      code: parsed.data.code,
      subtotal: parsed.data.subtotal,
      itemsCount: parsed.data.items_count,
      deliveryFee: parsed.data.delivery_fee,
      marketId: market.id,
    });

    if (!result.ok) {
      return applyRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error: result.error,
            promo: result.promo || null,
          },
          { status: result.status || 400 }
        ),
        rl
      );
    }

    return applyRateLimitHeaders(
      NextResponse.json({
        ok: true,
        promo: result.promo,
        message: result.message,
        totals: result.totals,
      }),
      rl
    );
  } catch (error) {
    const schemaMissing = isMissingPromoCodeSchemaError(error?.message);
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: schemaMissing ? "Promo code system is not available yet." : error?.message || "Unable to validate promo code.",
          schemaMissing,
        },
        { status: schemaMissing ? 503 : 500 }
      ),
      rl
    );
  }
}
