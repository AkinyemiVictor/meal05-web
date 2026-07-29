import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiUser } from "@/lib/admin-api-auth";
import { withNoStore } from "@/lib/api/no-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { SITE_NOTIFICATION_SEVERITIES, normalizeSiteNotificationRecord } from "@/lib/site-notifications";
import { loadSiteNotificationsAdminData } from "@/lib/site-notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
});

export async function GET() {
  const auth = await requireAdminApiUser();
  if (auth.response) return auth.response;

  const data = await loadSiteNotificationsAdminData({ limit: 50 });
  return withNoStore(NextResponse.json(data));
}

export async function POST(request) {
  const auth = await requireAdminApiUser();
  if (auth.response) return auth.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return withNoStore(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    return withNoStore(
      NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the notification fields." }, { status: 400 })
    );
  }

  const startsAt = toIsoOrNull(parsed.data.starts_at);
  const expiresAt = toIsoOrNull(parsed.data.expires_at);
  if (parsed.data.starts_at && !startsAt) {
    return withNoStore(NextResponse.json({ error: "Enter a valid start time." }, { status: 400 }));
  }
  if (parsed.data.expires_at && !expiresAt) {
    return withNoStore(NextResponse.json({ error: "Enter a valid expiry time." }, { status: 400 }));
  }
  if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) {
    return withNoStore(NextResponse.json({ error: "Expiry must be after start time." }, { status: 400 }));
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
    return withNoStore(NextResponse.json({ error: write.error.message }, { status: 400 }));
  }

  return withNoStore(NextResponse.json({ ok: true, notification: normalizeSiteNotificationRecord(write.data) }));
}
