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
  DEFAULT_DELIVERY_SETTINGS,
  DELIVERY_SETTINGS_KEY,
  normalizeDeliverySettingsRecord,
  normalizeServiceZoneFees,
  normalizeServiceZones,
} from "@/lib/delivery-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normalizeCutoffTime = (value) => {
  const text = String(value || "").trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
};

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:delivery-settings:save", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  }

  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr) {
    await logAdminError(authErr, { route: "/api/admin/delivery-settings/save", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  }
  if (!user) {
    await logAdminError("Not authenticated", { route: "/api/admin/delivery-settings/save", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    await logAdminError("Forbidden admin attempt", { route: "/api/admin/delivery-settings/save", actor: user.email });
    return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), rl);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl);
  }

  const serviceZoneFeeSchema = z.object({
    name: z.string().trim().min(1).max(80),
    fee: z.number().nonnegative().max(1_000_000_000),
    subzones: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          fee: z.number().nonnegative().max(1_000_000_000),
        })
      )
      .optional(),
  });

  const schema = z.object({
    delivery_fee: z.number().nonnegative().max(1_000_000_000),
    free_delivery_threshold: z.number().nonnegative().max(1_000_000_000),
    same_day_enabled: z.boolean(),
    same_day_cutoff_time: z.string().trim().max(5),
    service_zones: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
    service_zone_fees: z.array(serviceZoneFeeSchema).optional(),
    same_day_notice: z.union([z.string().trim().max(280), z.null()]).optional(),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    await logAdminError("Validation failed", { route: "/api/admin/delivery-settings/save", issues: parsed.error.issues });
    return applyRateLimitHeaders(respondZodError(parsed.error), rl);
  }

  const cutoffTime = normalizeCutoffTime(parsed.data.same_day_cutoff_time);
  if (!cutoffTime) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Enter a valid cutoff time." }, { status: 400 }), rl);
  }

  const normalizedServiceZoneFees = normalizeServiceZoneFees(
    parsed.data.service_zone_fees ?? parsed.data.service_zones,
    parsed.data.delivery_fee
  );
  const zoneNames = normalizeServiceZones(normalizedServiceZoneFees);

  const payload = {
    key: DELIVERY_SETTINGS_KEY,
    delivery_fee: Math.round(parsed.data.delivery_fee),
    free_delivery_threshold: Math.round(parsed.data.free_delivery_threshold),
    same_day_enabled: parsed.data.same_day_enabled,
    same_day_cutoff_time: cutoffTime,
    service_zones: zoneNames,
    service_zone_fees: normalizedServiceZoneFees,
    same_day_notice: parsed.data.same_day_notice || null,
    updated_at: new Date().toISOString(),
  };

  const admin = getSupabaseAdminClient();
  const currentRes = await admin.from("delivery_settings").select("*").eq("key", DELIVERY_SETTINGS_KEY).maybeSingle();
  if (currentRes.error) {
    await logAdminError(currentRes.error, { route: "/api/admin/delivery-settings/save", actor: user.email });
    return applyRateLimitHeaders(NextResponse.json({ error: currentRes.error.message }, { status: 400 }), rl);
  }

  const current = normalizeDeliverySettingsRecord(currentRes.data || DEFAULT_DELIVERY_SETTINGS);
  const write = currentRes.data
    ? await admin.from("delivery_settings").update(payload).eq("key", DELIVERY_SETTINGS_KEY).select("*").maybeSingle()
    : await admin.from("delivery_settings").insert(payload).select("*").maybeSingle();

  if (write.error) {
    await logAdminError(write.error, {
      route: "/api/admin/delivery-settings/save",
      actor: user.email,
      stage: currentRes.data ? "update" : "insert",
    });
    return applyRateLimitHeaders(NextResponse.json({ error: write.error.message }, { status: 400 }), rl);
  }

  const settings = normalizeDeliverySettingsRecord(write.data);
  await logAdminEvent({
    route: "/api/admin/delivery-settings/save",
    actor: user.email,
    before: current,
    after: settings,
    ok: true,
  });

  return applyRateLimitHeaders(NextResponse.json({ ok: true, settings }), rl);
}
