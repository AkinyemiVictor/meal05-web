import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { AVAILABILITY_REQUEST_SELECT, attachAvailabilityRequestLifecycle, calculateRequestTotal, expireAvailabilityRequest, resolveRequestState } from "@/lib/availability-requests-server";
import { loadAvailabilitySettings } from "@/lib/availability-settings-server";
import { sendAvailabilityReengagement } from "@/lib/availability-reengagement-server";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("return_to_cart") }),
  z.object({ action: z.literal("remove_unavailable_item"), itemId: z.string().uuid() }),
  z.object({ action: z.literal("convert") }),
]);

const actionHttpStatus = (code) => {
  if (code === "INVALID_INPUT") return 400;
  if (code === "REQUEST_NOT_FOUND") return 404;
  return 409;
};

const conversionHttpStatus = (code) => actionHttpStatus(code);

const loadCurrentRequest = async (admin, id, userId, now = new Date()) => {
  const { data, error } = await admin
    .from("availability_requests")
    .select(AVAILABILITY_REQUEST_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? attachAvailabilityRequestLifecycle(data, now) : null;
};

export async function POST(request, { params }) {
  if (!isTrustedRequestOrigin(request)) return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  const { id } = await params;
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request action" }, { status: 400 });
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("availability_requests").select(AVAILABILITY_REQUEST_SELECT)
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Availability request not found" }, { status: 404 });
  const availabilityRequest = await expireAvailabilityRequest(admin, data);

  if (parsed.data.action === "cancel") {
    const { data: cancellation, error: cancelError } = await admin.rpc("cancel_availability_request", {
      p_request_id: id,
      p_user_id: user.id,
    });
    if (cancelError) return NextResponse.json({ error: "Unable to cancel this request." }, { status: 500 });
    if (!cancellation?.ok) {
      return NextResponse.json(
        {
          error: cancellation?.error || "This request cannot be cancelled.",
          code: cancellation?.code || "AVAILABILITY_CANCEL_BLOCKED",
        },
        { status: actionHttpStatus(cancellation?.code) }
      );
    }
    try {
      const current = await loadCurrentRequest(admin, id, user.id);
      if (!current) return NextResponse.json({ error: "Availability request not found" }, { status: 404 });
      return NextResponse.json({ request: current, replayed: Boolean(cancellation.replayed) });
    } catch {
      return NextResponse.json({ error: "Request cancelled, but its latest state could not be loaded." }, { status: 500 });
    }
  }

  if (parsed.data.action === "return_to_cart") {
    const { data: restored, error: restoreError } = await admin.rpc("return_availability_request_to_cart", {
      p_request_id: id,
      p_user_id: user.id,
    });
    if (restoreError) return NextResponse.json({ error: "Unable to return this request to the cart." }, { status: 500 });
    if (!restored?.ok) {
      return NextResponse.json(
        {
          error: restored?.error || "This request cannot be returned to the cart.",
          code: restored?.code || "AVAILABILITY_RETURN_BLOCKED",
        },
        { status: actionHttpStatus(restored?.code) }
      );
    }
    try {
      const current = await loadCurrentRequest(admin, id, user.id);
      if (!current) return NextResponse.json({ error: "Availability request not found" }, { status: 404 });
      return NextResponse.json({
        returned: Number(restored.returned || 0),
        skipped: Number(restored.skipped || 0),
        replayed: Boolean(restored.replayed),
        request: current,
      });
    } catch {
      return NextResponse.json({ error: "Items were returned, but the latest request state could not be loaded." }, { status: 500 });
    }
  }

  if (parsed.data.action === "remove_unavailable_item") {
    if (availabilityRequest.status !== "action_required") return NextResponse.json({ error: "No item needs a decision" }, { status: 409 });
    const item = (availabilityRequest.items || []).find((entry) => entry.id === parsed.data.itemId);
    if (!item || item.resolution_status !== "unavailable") return NextResponse.json({ error: "Unavailable item not found" }, { status: 404 });
    const now = new Date();
    const removedAt = now.toISOString();
    const remaining = (availabilityRequest.items || []).map((entry) => entry.id === item.id ? { ...entry, customer_removed_at: removedAt } : entry);
    const status = resolveRequestState(remaining);
    const total = calculateRequestTotal(remaining);
    const confirmed = status === "confirmed";
    let availabilitySettings = null;
    if (confirmed) {
      try {
        availabilitySettings = await loadAvailabilitySettings({ admin, marketId: availabilityRequest.market_id });
      } catch (settingsError) {
        return NextResponse.json(
          { error: settingsError?.message || "Availability settings could not be loaded." },
          { status: 503 }
        );
      }
    }
    const { error: removeError } = await admin.from("availability_request_items")
      .update({ customer_removed_at: removedAt, updated_at: removedAt })
      .eq("id", item.id).eq("request_id", id);
    if (removeError) return NextResponse.json({ error: removeError.message }, { status: 400 });
    const { data: updated, error: updateError } = await admin.from("availability_requests").update({
      status, final_total: confirmed ? total : null,
      confirmed_at: confirmed ? removedAt : null,
      payment_expires_at: confirmed
        ? new Date(now.getTime() + availabilitySettings.paymentWindowMinutes * 60000).toISOString()
        : null,
      updated_at: removedAt,
    }).eq("id", id).eq("status", "action_required").select(AVAILABILITY_REQUEST_SELECT).maybeSingle();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    if (!updated) return NextResponse.json({ error: "This request changed. Reload and try again." }, { status: 409 });

    if (confirmed) {
      await sendAvailabilityReengagement({
        admin,
        request: updated,
        status,
        paymentWindowMinutes: availabilitySettings.paymentWindowMinutes,
        now,
      });
    }

    return NextResponse.json({ request: attachAvailabilityRequestLifecycle(updated, now) });
  }

  const { data: conversion, error: conversionError } = await admin.rpc("convert_availability_request_to_order", {
    p_request_id: id,
    p_user_id: user.id,
  });
  if (conversionError) {
    return NextResponse.json({ error: "Unable to create the confirmed order." }, { status: 500 });
  }
  if (!conversion?.ok) {
    return NextResponse.json(
      {
        error: conversion?.error || "This request cannot be converted to an order.",
        code: conversion?.code || "AVAILABILITY_CONVERSION_BLOCKED",
      },
      { status: conversionHttpStatus(conversion?.code) }
    );
  }

  const orderId = Number(conversion.order_id);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "The confirmed order could not be resolved." }, { status: 500 });
  }

  return NextResponse.json(
    {
      orderId,
      order: conversion.order || { id: orderId },
      replayed: Boolean(conversion.replayed),
    },
    { status: conversion.replayed ? 200 : 201 }
  );
}
