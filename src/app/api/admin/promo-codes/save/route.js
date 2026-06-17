import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminAccess } from "@/lib/admin-access";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { logAdminEvent, logAdminError } from "@/lib/api/log";
import { respondZodError } from "@/lib/api/validate";
import { normalizePromoCode, normalizePromoCodeRecord } from "@/lib/promo-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toId = (value) => {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
};

const toNullableNumber = (value) => {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toIsoString = (value) => {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:promo-codes:save", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  }

  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr) {
    await logAdminError(authErr, { route: "/api/admin/promo-codes/save", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  }
  if (!user) {
    await logAdminError("Not authenticated", { route: "/api/admin/promo-codes/save", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    await logAdminError("Forbidden admin attempt", { route: "/api/admin/promo-codes/save", actor: user.email });
    return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), rl);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl);
  }

  const schema = z.object({
    id: z.union([z.string(), z.number(), z.null()]).optional(),
    code: z.string().trim().min(3).max(32),
    description: z.union([z.string().trim().max(160), z.null()]).optional(),
    discount_type: z.enum(["percent", "fixed", "delivery"]),
    discount_value: z.number().positive().max(1_000_000_000),
    min_subtotal: z.union([z.number().nonnegative().max(1_000_000_000), z.null()]).optional(),
    max_discount: z.union([z.number().nonnegative().max(1_000_000_000), z.null()]).optional(),
    starts_at: z.union([z.string().trim().max(80), z.null()]).optional(),
    expires_at: z.union([z.string().trim().max(80), z.null()]).optional(),
    usage_limit: z.union([z.number().int().positive().max(1_000_000), z.null()]).optional(),
    is_active: z.boolean(),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    await logAdminError("Validation failed", { route: "/api/admin/promo-codes/save", issues: parsed.error.issues });
    return applyRateLimitHeaders(respondZodError(parsed.error), rl);
  }

  const id = toId(parsed.data.id);
  const startsAt = toIsoString(parsed.data.starts_at);
  const expiresAt = toIsoString(parsed.data.expires_at);
  if (parsed.data.starts_at != null && !startsAt) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid start time" }, { status: 400 }), rl);
  }
  if (parsed.data.expires_at != null && !expiresAt) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid expiry time" }, { status: 400 }), rl);
  }
  if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Expiry must be after start time" }, { status: 400 }), rl);
  }

  const code = normalizePromoCode(parsed.data.code);
  const admin = getSupabaseAdminClient();

  const payload = {
    code,
    description: parsed.data.description || null,
    discount_type: parsed.data.discount_type,
    discount_value: parsed.data.discount_value,
    min_subtotal: toNullableNumber(parsed.data.min_subtotal),
    max_discount: toNullableNumber(parsed.data.max_discount),
    starts_at: startsAt,
    expires_at: expiresAt,
    usage_limit: toNullableNumber(parsed.data.usage_limit),
    is_active: parsed.data.is_active,
    updated_at: new Date().toISOString(),
  };

  if (payload.discount_type === "percent" && payload.discount_value > 100) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Percent promo discount cannot exceed 100." }, { status: 400 }),
      rl
    );
  }

  if (payload.discount_type === "delivery" && payload.max_discount != null) {
    payload.max_discount = null;
  }

  let existing = null;
  if (id) {
    const existingRes = await admin
      .from("promo_codes")
      .select(
        "id, code, description, discount_type, discount_value, min_subtotal, max_discount, starts_at, expires_at, usage_limit, usage_count, is_active"
      )
      .eq("id", id)
      .maybeSingle();
    if (existingRes.error) {
      await logAdminError(existingRes.error, { route: "/api/admin/promo-codes/save", actor: user.email, promo_code_id: id });
      return applyRateLimitHeaders(NextResponse.json({ error: existingRes.error.message }, { status: 400 }), rl);
    }
    if (!existingRes.data) {
      return applyRateLimitHeaders(NextResponse.json({ error: "Promo code not found" }, { status: 404 }), rl);
    }
    existing = normalizePromoCodeRecord(existingRes.data);
  }

  const write = id
    ? await admin
        .from("promo_codes")
        .update(payload)
        .eq("id", id)
        .select(
          "id, code, description, discount_type, discount_value, min_subtotal, max_discount, starts_at, expires_at, usage_limit, usage_count, is_active, created_at, updated_at"
        )
        .maybeSingle()
    : await admin
        .from("promo_codes")
        .insert(payload)
        .select(
          "id, code, description, discount_type, discount_value, min_subtotal, max_discount, starts_at, expires_at, usage_limit, usage_count, is_active, created_at, updated_at"
        )
        .maybeSingle();

  if (write.error) {
    await logAdminError(write.error, {
      route: "/api/admin/promo-codes/save",
      actor: user.email,
      promo_code_id: id || undefined,
      code,
      stage: id ? "update" : "insert",
    });
    return applyRateLimitHeaders(NextResponse.json({ error: write.error.message }, { status: 400 }), rl);
  }

  const promo = normalizePromoCodeRecord(write.data);
  await logAdminEvent({
    route: "/api/admin/promo-codes/save",
    actor: user.email,
    promo_code_id: promo?.id || undefined,
    code: promo?.code || code,
    before: existing || undefined,
    after: promo,
    created: !id,
    ok: true,
  });

  return applyRateLimitHeaders(NextResponse.json({ ok: true, promo }), rl);
}
