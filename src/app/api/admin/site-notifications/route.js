import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiUser } from "@/lib/admin-api-auth";
import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { logAdminError, logAdminEvent } from "@/lib/api/log";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { SITE_NOTIFICATION_SEVERITIES, normalizeSiteNotificationRecord } from "@/lib/site-notifications";
import { loadSiteNotificationsAdminData } from "@/lib/site-notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const send = (body, status, rl) => applyRateLimitHeaders(withNoStore(NextResponse.json(body, { status })), rl);

const toId = (value) => {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
};

const toIsoOrNull = (value) => {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const schema = z.object({
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().min(1).max(700),
  severity: z.enum(SITE_NOTIFICATION_SEVERITIES),
  is_active: z.boolean(),
  starts_at: z.union([z.string().trim().max(80), z.null()]).optional(),
  expires_at: z.union([z.string().trim().max(80), z.null()]).optional(),
}).strict();

export async function GET(request) {
  const rl = await checkRateLimit({ request, id: "admin:site-notifications:get", limit: 90, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);
  const auth = await requireAdminApiUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);

  const data = await loadSiteNotificationsAdminData({ limit: 50 });
  return send(data, 200, rl);
}

export async function POST(request) {
  const rl = await checkRateLimit({ request, id: "admin:site-notifications:save", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);
  const auth = await requireAdminApiUser();
  if (auth.response) return applyRateLimitHeaders(auth.response, rl);

  let body;
  try {
    body = await request.json();
  } catch {
    return send({ error: "Invalid JSON" }, 400, rl);
  }

  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    return send({ error: parsed.error.issues[0]?.message || "Check the notification fields." }, 400, rl);
  }

  const startsAt = toIsoOrNull(parsed.data.starts_at);
  const expiresAt = toIsoOrNull(parsed.data.expires_at);
  if (parsed.data.starts_at && !startsAt) {
    return send({ error: "Enter a valid start time." }, 400, rl);
  }
  if (parsed.data.expires_at && !expiresAt) {
    return send({ error: "Enter a valid expiry time." }, 400, rl);
  }
  if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) {
    return send({ error: "Expiry must be after start time." }, 400, rl);
  }

  const id = toId(parsed.data.id);
  const payload = {
    title: parsed.data.title,
    body: parsed.data.body,
    severity: parsed.data.severity,
    is_active: parsed.data.is_active,
    starts_at: startsAt,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id,
  };
  if (!id) payload.created_by = auth.user.id;

  const admin = getSupabaseAdminClient();
  const write = id
    ? await admin.from("site_notifications").update(payload).eq("id", id).select("*").maybeSingle()
    : await admin.from("site_notifications").insert(payload).select("*").maybeSingle();

  if (write.error) {
    await logAdminError(write.error, { route: "/api/admin/site-notifications", actor: auth.user.email, notification_id: id });
    return send({ error: write.error.message }, 400, rl);
  }

  await logAdminEvent({
    route: "/api/admin/site-notifications",
    actor: auth.user.email,
    notification_id: write.data?.id,
    action: id ? "updated" : "created",
    is_active: parsed.data.is_active,
    severity: parsed.data.severity,
    ok: true,
  });

  return send({ ok: true, notification: normalizeSiteNotificationRecord(write.data) }, 200, rl);
}
