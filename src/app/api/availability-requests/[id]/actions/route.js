import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { AVAILABILITY_REQUEST_SELECT, calculateRequestTotal, expireAvailabilityRequest, resolveRequestState } from "@/lib/availability-requests-server";
import { loadAvailabilitySettings } from "@/lib/availability-settings-server";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("return_to_cart") }),
  z.object({ action: z.literal("remove_unavailable_item"), itemId: z.string().uuid() }),
  z.object({ action: z.literal("convert") }),
]);

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
    if (["converted", "cancelled"].includes(availabilityRequest.status)) return NextResponse.json({ request: availabilityRequest });
    const { data: updated, error: updateError } = await admin.from("availability_requests")
      .update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id)
      .select(AVAILABILITY_REQUEST_SELECT).single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    return NextResponse.json({ request: updated });
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
    return NextResponse.json({ returned: lines.length });
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
    }).eq("id", id).select(AVAILABILITY_REQUEST_SELECT).single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    return NextResponse.json({ request: updated });
  }

  if (availabilityRequest.status === "converted" && availabilityRequest.converted_order_id) {
    return NextResponse.json({ orderId: availabilityRequest.converted_order_id, replayed: true });
  }
  if (availabilityRequest.status !== "confirmed") return NextResponse.json({ error: "This request is not ready for payment" }, { status: 409 });
  if (availabilityRequest.payment_expires_at && new Date(availabilityRequest.payment_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "The payment window has expired" }, { status: 409 });
  }
  const activeItems = (availabilityRequest.items || []).filter((item) => !item.customer_removed_at && ["confirmed", "not_required"].includes(item.resolution_status));
  if (!activeItems.length) return NextResponse.json({ error: "This request has no confirmed items" }, { status: 409 });
  const total = calculateRequestTotal(activeItems);
  const { data: order, error: orderError } = await admin.from("orders").insert({
    user_id: user.id, total, subtotal: total, delivery_fee: 0, status: "pending",
    payment_status: "awaiting_payment", payment_method: "moniepoint_transfer",
    market_id: availabilityRequest.market_id, currency_code: availabilityRequest.currency_code,
    delivery_address: availabilityRequest.delivery_address,
    delivery_contact_name: availabilityRequest.customer_name,
    delivery_contact_phone: availabilityRequest.customer_phone,
    customer_note: availabilityRequest.customer_note,
    delivery_instructions: "Delivery scheduling starts 24 hours after verified payment.",
    fulfillment_type: "delivery", availability_request_id: availabilityRequest.id,
  }).select("id,total,status,payment_status").single();
  if (orderError) {
    const { data: existing } = await admin.from("orders").select("id,total,status,payment_status")
      .eq("availability_request_id", availabilityRequest.id).maybeSingle();
    if (existing) return NextResponse.json({ orderId: existing.id, replayed: true });
    return NextResponse.json({ error: orderError.message }, { status: 400 });
  }
  const { error: itemError } = await admin.from("order_items").insert(activeItems.map((item) => ({
    order_id: order.id, product_id: item.product_id, variant_id: item.variant_id,
    quantity: item.quantity, price: item.confirmed_unit_price ?? item.submitted_unit_price,
    currency_code: availabilityRequest.currency_code, size_preference: item.size_preference,
    fulfillment_note: "Closest reasonable preference may be used to keep fulfilment fast. Delivery scheduling starts 24 hours after verified payment.",
  })));
  if (itemError) {
    await admin.from("orders").delete().eq("id", order.id);
    return NextResponse.json({ error: itemError.message }, { status: 400 });
  }
  await admin.from("availability_requests").update({ status: "converted", converted_order_id: order.id, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ orderId: order.id, order }, { status: 201 });
}
