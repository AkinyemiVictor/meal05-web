import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminAccess } from "@/lib/admin-access";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { AVAILABILITY_REQUEST_SELECT, attachAvailabilityRequestLifecycle, calculateRequestTotal, resolveRequestState } from "@/lib/availability-requests-server";
import { formatAvailabilityDuration } from "@/lib/availability-settings";
import { loadAvailabilitySettings } from "@/lib/availability-settings-server";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";

const schema = z.object({
  itemId: z.string().uuid(),
  resolutionStatus: z.enum(["confirmed", "unavailable"]),
  confirmedUnitPrice: z.number().finite().nonnegative().optional(),
  adminNote: z.string().trim().max(1000).optional().default(""),
});

export async function PATCH(request, { params }) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  const { id } = await params;
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!await hasAdminAccess({ userId: user.id, email: user.email })) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid update" }, { status: 400 });
  const admin = getSupabaseAdminClient();
  const { data: record, error } = await admin.from("availability_requests").select(AVAILABILITY_REQUEST_SELECT).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!record) return NextResponse.json({ error: "Availability request not found" }, { status: 404 });
  if (!["pending", "checking", "action_required"].includes(record.status)) return NextResponse.json({ error: "This request can no longer be changed" }, { status: 409 });
  const item = (record.items || []).find((entry) => entry.id === parsed.data.itemId && entry.requires_confirmation);
  if (!item) return NextResponse.json({ error: "Request item not found" }, { status: 404 });
  const price = parsed.data.resolutionStatus === "confirmed"
    ? Number(parsed.data.confirmedUnitPrice ?? item.submitted_unit_price)
    : null;
  const now = new Date();
  const nextItems = (record.items || []).map((entry) => entry.id === item.id ? {
    ...entry, resolution_status: parsed.data.resolutionStatus, confirmed_unit_price: price,
    admin_note: parsed.data.adminNote || null,
  } : entry);
  const status = resolveRequestState(nextItems);
  const confirmed = status === "confirmed";
  const total = calculateRequestTotal(nextItems);
  let availabilitySettings = null;
  if (confirmed) {
    try {
      availabilitySettings = await loadAvailabilitySettings({ admin, marketId: record.market_id });
    } catch (settingsError) {
      return NextResponse.json(
        { error: settingsError?.message || "Availability settings could not be loaded." },
        { status: 503 }
      );
    }
  }

  const { error: itemError } = await admin.from("availability_request_items").update({
    resolution_status: parsed.data.resolutionStatus, confirmed_unit_price: price,
    admin_note: parsed.data.adminNote || null, updated_at: now.toISOString(),
  }).eq("id", item.id).eq("request_id", id);
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 });
  const { data: updated, error: updateError } = await admin.from("availability_requests").update({
    status, final_total: confirmed ? total : null, confirmed_at: confirmed ? now.toISOString() : null,
    payment_expires_at: confirmed
      ? new Date(now.getTime() + availabilitySettings.paymentWindowMinutes * 60000).toISOString()
      : null,
    updated_at: now.toISOString(),
  }).eq("id", id).eq("status", record.status).select(AVAILABILITY_REQUEST_SELECT).maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  if (!updated) {
    return NextResponse.json({ error: "This request changed while it was being updated. Reload and try again." }, { status: 409 });
  }
  if (status === "confirmed" || status === "action_required") {
    await admin.from("notifications").insert({
      user_id: record.user_id, channel: "in_app",
      event: status === "confirmed" ? "availability_request_confirmed" : "availability_request_action_required",
      subject: status === "confirmed" ? "Basket availability confirmed" : "Basket update needed",
      body: status === "confirmed"
        ? `${record.request_number} is confirmed. Pay within ${formatAvailabilityDuration(availabilitySettings.paymentWindowMinutes)} to keep this availability.`
        : `${record.request_number} has an unavailable item. Review it to continue.`,
      status: "delivered", sent_at: now.toISOString(),
    });
  }
  return NextResponse.json({ request: attachAvailabilityRequestLifecycle(updated, now) });
}
