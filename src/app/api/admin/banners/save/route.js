import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminAccess } from "@/lib/admin-access";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { logAdminEvent, logAdminError } from "@/lib/api/log";
import { respondZodError } from "@/lib/api/validate";
import {
  normalizeBannerDateTime,
  normalizeBannerPlacement,
  normalizeBannerRecord,
  normalizeBannerText,
} from "@/lib/banners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toId = (value) => {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
};

const toNullableInteger = (value) => {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
};

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:banners:save", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  }

  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr) {
    await logAdminError(authErr, { route: "/api/admin/banners/save", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  }
  if (!user) {
    await logAdminError("Not authenticated", { route: "/api/admin/banners/save", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    await logAdminError("Forbidden admin attempt", { route: "/api/admin/banners/save", actor: user.email });
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
    placement: z.enum(["hero", "advert"]).optional(),
    title: z.union([z.string().trim().max(140), z.null()]).optional(),
    heading: z.union([z.string().trim().max(400), z.null()]).optional(),
    tag: z.union([z.string().trim().max(80), z.null()]).optional(),
    description: z.union([z.string().trim().max(240), z.null()]).optional(),
    image_url: z.string().trim().min(1).max(500),
    mobile_image_url: z.union([z.string().trim().max(500), z.null()]).optional(),
    alt: z.union([z.string().trim().max(160), z.null()]).optional(),
    cta_label: z.union([z.string().trim().max(48), z.null()]).optional(),
    cta_href: z.union([z.string().trim().max(500), z.null()]).optional(),
    sort_order: z.union([z.number().int().min(0).max(10_000), z.null()]).optional(),
    accent: z.union([z.string().trim().max(32), z.null()]).optional(),
    accent_soft: z.union([z.string().trim().max(64), z.null()]).optional(),
    starts_at: z.union([z.string().trim().max(80), z.null()]).optional(),
    expires_at: z.union([z.string().trim().max(80), z.null()]).optional(),
    is_active: z.boolean(),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    await logAdminError("Validation failed", { route: "/api/admin/banners/save", issues: parsed.error.issues });
    return applyRateLimitHeaders(respondZodError(parsed.error), rl);
  }

  const id = toId(parsed.data.id);
  const startsAt = normalizeBannerDateTime(parsed.data.starts_at);
  const expiresAt = normalizeBannerDateTime(parsed.data.expires_at);
  if (parsed.data.starts_at != null && !startsAt) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid start time" }, { status: 400 }), rl);
  }
  if (parsed.data.expires_at != null && !expiresAt) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid expiry time" }, { status: 400 }), rl);
  }
  if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Expiry must be after start time" }, { status: 400 }), rl);
  }

  const ctaLabel = normalizeBannerText(parsed.data.cta_label, { max: 48 });
  const ctaHref = normalizeBannerText(parsed.data.cta_href, { max: 500 });
  const placement = normalizeBannerPlacement(parsed.data.placement);
  if ((ctaLabel && !ctaHref) || (!ctaLabel && ctaHref)) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "CTA label and CTA link must be provided together." }, { status: 400 }),
      rl
    );
  }

  const payload = {
    placement,
    title: normalizeBannerText(parsed.data.title, { max: 140 }),
    heading: normalizeBannerText(parsed.data.heading, { max: 400 }),
    tag: normalizeBannerText(parsed.data.tag, { max: 80 }),
    description: normalizeBannerText(parsed.data.description, { max: 240 }),
    image_url: String(parsed.data.image_url || "").trim(),
    mobile_image_url: normalizeBannerText(parsed.data.mobile_image_url, { max: 500 }),
    alt: normalizeBannerText(parsed.data.alt, { max: 160 }),
    cta_label: ctaLabel,
    cta_href: ctaHref,
    sort_order: toNullableInteger(parsed.data.sort_order),
    accent: normalizeBannerText(parsed.data.accent, { max: 32 }),
    accent_soft: normalizeBannerText(parsed.data.accent_soft, { max: 64 }),
    starts_at: startsAt,
    expires_at: expiresAt,
    is_active: parsed.data.is_active,
    updated_at: new Date().toISOString(),
  };

  const admin = getSupabaseAdminClient();
  let existing = null;
  if (id) {
    const existingRes = await admin.from("banner_urls").select("*").eq("id", id).maybeSingle();
    if (existingRes.error) {
      await logAdminError(existingRes.error, { route: "/api/admin/banners/save", actor: user.email, banner_id: id });
      return applyRateLimitHeaders(NextResponse.json({ error: existingRes.error.message }, { status: 400 }), rl);
    }
    if (!existingRes.data) {
      return applyRateLimitHeaders(NextResponse.json({ error: "Banner not found" }, { status: 404 }), rl);
    }
    existing = normalizeBannerRecord(existingRes.data);
  }

  const write = id
    ? await admin.from("banner_urls").update(payload).eq("id", id).select("*").maybeSingle()
    : await admin.from("banner_urls").insert(payload).select("*").maybeSingle();

  if (write.error) {
    await logAdminError(write.error, {
      route: "/api/admin/banners/save",
      actor: user.email,
      banner_id: id || undefined,
      stage: id ? "update" : "insert",
    });
    return applyRateLimitHeaders(NextResponse.json({ error: write.error.message }, { status: 400 }), rl);
  }

  const banner = normalizeBannerRecord(write.data);
  await logAdminEvent({
    route: "/api/admin/banners/save",
    actor: user.email,
    banner_id: banner?.id || id || undefined,
    placement,
    before: existing || undefined,
    after: banner,
    created: !id,
    ok: true,
  });

  return applyRateLimitHeaders(NextResponse.json({ ok: true, banner }), rl);
}
