import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { AVAILABILITY_REQUEST_SELECT, attachAvailabilityRequestLifecycle, calculateRequestTotal, expireAvailabilityRequest, resolveRequestState } from "@/lib/availability-requests-server";
import { loadAvailabilitySettings } from "@/lib/availability-settings-server";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("return_to_cart") }),
  z.object({ action: z.literal("remove_unavailable_item"), itemId: z.string().uuid() }),
  z.object({ action: z.literal("convert") }),
]);

const conversionHttpStatus = (code) => {
  if (code === "INVALID_INPUT") return 400;
  if (code === "REQUEST_NOT_FOUND") return 404;
  return 409;
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
    if (["converted", "cancelled", "expired"].includes(availabilityRequest.status)) {
      return NextResponse.json({ request: availabilityRequest });
    }
    const now = new Date();
    const { data: updated, error: updateError } = await admin.from("availability_requests")
      .update({ status: "cancelled", updated_at: now.toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", availabilityRequest.status)
      .select(AVAILABILITY_REQUEST_SELECT)
      .maybeSingle();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    if (!updated) return NextResponse.json({ error: "This request changed. Reload and try again." }, { status: 409 });
    return NextResponse.json({ request: attachAvailabilityRequestLifecycle(updated, now) });
  }

  if (parsed.data.action === "return_to_cart") {
    if (!["cancelled", "expired", "action_required"].includes(availabilityRequest.status)) {
      return NextResponse.json({ error: "This request cannot be returned to the cart yet" }, { status: 409 });
    }
    const lines = (availabilityRequest.items || []).filter((item) => !item.customer_removed_at && item.resolution_status !== "unavailable");
    for (const item of lines) {
      await admin.from("cart_items").upsert({
        user_id: user.id, product_id: item.product_id, variant_id: item.variant_id,
        product_name: item.product_name, variant_name: item.variant_name,
        unit_price_at_add: item.confirmed_unit_price ?? item.submitted_unit_price,
        quantity: item.quantity, size_preference: item.size_preference, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,variant_id" });
    }
    return NextResponse.json({ returned: lines.length, request: availabilityRequest });
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
