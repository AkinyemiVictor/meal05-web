import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminAccess } from "@/lib/admin-access";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { logAdminEvent, logAdminError } from "@/lib/api/log";
import { respondZodError } from "@/lib/api/validate";
import { insertOrderStatusHistory } from "@/lib/order-status-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDER_STATUS_OPTIONS = new Set([
  "pending",
  "confirmed",
  "processing",
  "ready_for_dispatch",
  "dispatched",
  "shipped",
  "delivered",
  "completed",
  "stock_failed",
  "payment_failed",
  "cancelled",
]);

const PAYMENT_STATUS_OPTIONS = new Set([
  "awaiting_payment",
  "awaiting_confirmation",
  "confirmed",
  "rejected",
  "pending",
  "processing",
  "paid",
  "failed",
  "refunded",
  "unpaid",
]);

const MANUAL_PAYMENT_METHODS = new Set([
  "cash",
  "cash_on_delivery",
  "cash on delivery",
  "cod",
  "cash_on_pickup",
  "cash on pickup",
  "cop",
  "pay_on_delivery",
  "pay on delivery",
  "pos",
]);

const DELIVERY_STATUS_OPTIONS = new Set([
  "awaiting dispatch",
  "dispatched",
  "in transit",
  "delivered",
  "completed",
  "delayed",
  "returned",
]);

const ORDER_STATUS_TRANSITIONS = {
  pending: new Set(["pending", "confirmed", "processing", "completed", "cancelled"]),
  confirmed: new Set(["confirmed", "processing", "cancelled"]),
  processing: new Set(["processing", "ready_for_dispatch", "shipped", "completed", "payment_failed", "cancelled"]),
  ready_for_dispatch: new Set(["ready_for_dispatch", "dispatched", "cancelled"]),
  dispatched: new Set(["dispatched", "delivered", "completed"]),
  shipped: new Set(["shipped", "dispatched", "delivered", "completed"]),
  delivered: new Set(["delivered", "completed"]),
  completed: new Set(["completed"]),
  cancelled: new Set(["cancelled"]),
  stock_failed: new Set(["stock_failed", "processing", "cancelled"]),
  payment_failed: new Set(["payment_failed", "processing", "cancelled"]),
};

const PAYMENT_STATUS_TRANSITIONS = {
  awaiting_payment: new Set(["awaiting_payment", "awaiting_confirmation", "confirmed", "rejected", "failed"]),
  awaiting_confirmation: new Set(["awaiting_confirmation", "confirmed", "rejected"]),
  confirmed: new Set(["confirmed", "refunded"]),
  rejected: new Set(["rejected", "awaiting_payment", "awaiting_confirmation"]),
  pending: new Set(["pending", "processing", "paid", "failed", "unpaid"]),
  processing: new Set(["processing", "paid", "failed"]),
  unpaid: new Set(["unpaid", "pending", "processing", "paid", "failed"]),
  failed: new Set(["failed", "pending", "processing", "paid"]),
  paid: new Set(["paid", "refunded"]),
  refunded: new Set(["refunded"]),
};

const DELIVERY_STATUS_TRANSITIONS = {
  "awaiting dispatch": new Set(["awaiting dispatch", "dispatched", "delayed", "completed", "returned"]),
  dispatched: new Set(["dispatched", "in transit", "delivered", "completed", "delayed", "returned"]),
  "in transit": new Set(["in transit", "delivered", "completed", "delayed", "returned"]),
  delayed: new Set(["delayed", "dispatched", "in transit", "delivered", "completed", "returned"]),
  delivered: new Set(["delivered", "completed"]),
  completed: new Set(["completed"]),
  returned: new Set(["returned"]),
};

const isAllowedStatusTransition = (fromStatus, toStatus) => {
  if (!toStatus) return true;
  const from = String(fromStatus || "").toLowerCase();
  const to = String(toStatus || "").toLowerCase();
  if (!from || from === to) return true;
  const allowed = ORDER_STATUS_TRANSITIONS[from];
  if (!allowed) return true; // Allow legacy statuses not yet mapped.
  return allowed.has(to);
};

const isAllowedPaymentStatusTransition = (fromStatus, toStatus) => {
  if (!toStatus) return true;
  const from = String(fromStatus || "").toLowerCase();
  const to = String(toStatus || "").toLowerCase();
  if (!from || from === to) return true;
  const allowed = PAYMENT_STATUS_TRANSITIONS[from];
  if (!allowed) return true;
  return allowed.has(to);
};

const isAllowedDeliveryStatusTransition = (fromStatus, toStatus) => {
  if (!toStatus) return true;
  const from = String(fromStatus || "").toLowerCase();
  const to = String(toStatus || "").toLowerCase();
  if (!from || from === to) return true;
  const allowed = DELIVERY_STATUS_TRANSITIONS[from];
  if (!allowed) return true;
  return allowed.has(to);
};

export async function POST(req) {
  const rl = await checkRateLimit({ request: req, id: "admin:orders:update-status", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  }

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr) {
    await logAdminError(authErr, { route: "/api/admin/orders/status", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: authErr.message }, { status: 401 }), rl);
  }
  if (!user) {
    await logAdminError("Not authenticated", { route: "/api/admin/orders/status", stage: "auth" });
    return applyRateLimitHeaders(NextResponse.json({ error: "Not authenticated" }, { status: 401 }), rl);
  }

  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    await logAdminError("Forbidden admin attempt", { route: "/api/admin/orders/status", actor: user.email });
    return applyRateLimitHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }), rl);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return applyRateLimitHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), rl);
  }

  const schema = z.object({
    order_id: z.union([z.string(), z.number()]),
    status: z.string().trim().toLowerCase().optional(),
    payment_status: z.string().trim().toLowerCase().optional(),
    delivery_status: z.string().trim().toLowerCase().optional(),
    note: z.string().trim().max(500).optional(),
  });
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    await logAdminError("Validation failed", { route: "/api/admin/orders/status", issues: parsed.error.issues });
    return applyRateLimitHeaders(respondZodError(parsed.error), rl);
  }

  const { order_id, note } = parsed.data;
  const nextStatus = parsed.data.status || null;
  const nextPaymentStatus = parsed.data.payment_status || null;
  const nextDeliveryStatus = parsed.data.delivery_status || null;
  if (!nextStatus && !nextPaymentStatus && !nextDeliveryStatus) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Provide at least one of status, payment_status, or delivery_status." }, { status: 400 }),
      rl
    );
  }

  if (nextStatus && !ORDER_STATUS_OPTIONS.has(nextStatus)) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: `Unsupported order status: ${nextStatus}` }, { status: 400 }),
      rl
    );
  }
  if (nextPaymentStatus && !PAYMENT_STATUS_OPTIONS.has(nextPaymentStatus)) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: `Unsupported payment status: ${nextPaymentStatus}` }, { status: 400 }),
      rl
    );
  }
  if (nextDeliveryStatus && !DELIVERY_STATUS_OPTIONS.has(nextDeliveryStatus)) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: `Unsupported delivery status: ${nextDeliveryStatus}` }, { status: 400 }),
      rl
    );
  }

  const admin = getSupabaseAdminClient();
  const orderId = String(order_id).trim();
  const { data: existingOrder, error: findErr } = await admin
    .from("orders")
    .select("id, status, payment_status, delivery_status, payment_method")
    .eq("id", orderId)
    .maybeSingle();
  if (findErr) {
    await logAdminError(findErr, { route: "/api/admin/orders/status", actor: user.email, order_id: orderId });
    return applyRateLimitHeaders(NextResponse.json({ error: findErr.message }, { status: 400 }), rl);
  }
  if (!existingOrder) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Order not found" }, { status: 404 }), rl);
  }

  const currentStatus = String(existingOrder.status || "").toLowerCase();
  const currentPaymentStatus = String(existingOrder.payment_status || "").toLowerCase();
  const currentDeliveryStatus = String(existingOrder.delivery_status || "").toLowerCase();
  const paymentMethod = String(existingOrder.payment_method || "").toLowerCase();
  if (nextStatus && !isAllowedStatusTransition(currentStatus, nextStatus)) {
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: `Invalid order status transition: ${currentStatus || "unknown"} -> ${nextStatus}`,
        },
        { status: 409 }
      ),
      rl
    );
  }
  if (nextPaymentStatus && !isAllowedPaymentStatusTransition(currentPaymentStatus, nextPaymentStatus)) {
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: `Invalid payment status transition: ${currentPaymentStatus || "unknown"} -> ${nextPaymentStatus}`,
        },
        { status: 409 }
      ),
      rl
    );
  }
  if (nextPaymentStatus && !MANUAL_PAYMENT_METHODS.has(paymentMethod) && nextPaymentStatus !== currentPaymentStatus) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: "Payment status can only be updated manually for cash/POS orders. Gateway payments are webhook-controlled." },
        { status: 403 }
      ),
      rl
    );
  }
  if (nextDeliveryStatus && !isAllowedDeliveryStatusTransition(currentDeliveryStatus, nextDeliveryStatus)) {
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: `Invalid delivery status transition: ${currentDeliveryStatus || "unknown"} -> ${nextDeliveryStatus}`,
        },
        { status: 409 }
      ),
      rl
    );
  }

  const paymentIsConfirmed = ["confirmed", "paid"].includes(currentPaymentStatus) || ["confirmed", "paid"].includes(nextPaymentStatus);
  const fulfilmentRequiresPayment = new Set(["confirmed", "processing", "ready_for_dispatch", "dispatched", "shipped", "delivered", "completed"]);
  if (nextStatus && fulfilmentRequiresPayment.has(nextStatus) && !paymentIsConfirmed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Confirm payment before moving an order into fulfilment." }, { status: 409 }),
      rl
    );
  }

  const patch = {};
  if (nextStatus) patch.status = nextStatus;
  if (nextPaymentStatus) patch.payment_status = nextPaymentStatus;
  if (nextDeliveryStatus) patch.delivery_status = nextDeliveryStatus;

  const { data: updated, error: updateErr } = await admin
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .select("id, status, payment_status, delivery_status")
    .maybeSingle();
  if (updateErr) {
    await logAdminError(updateErr, {
      route: "/api/admin/orders/status",
      actor: user.email,
      order_id: orderId,
      patch,
    });
    return applyRateLimitHeaders(NextResponse.json({ error: updateErr.message }, { status: 400 }), rl);
  }

  const updatedStatus = updated?.status ?? patch.status ?? existingOrder.status;
  if (nextStatus && String(updatedStatus || "").toLowerCase() !== currentStatus) {
    const statusHistoryRes = await insertOrderStatusHistory(admin, {
      orderId,
      fromStatus: existingOrder.status,
      toStatus: updatedStatus,
      changedBy: user.id,
      note,
    });
    if (statusHistoryRes.error) {
      await logAdminError(statusHistoryRes.error, {
        route: "/api/admin/orders/status",
        stage: "insert:order_status_history",
        actor: user.email,
        order_id: orderId,
        before_status: existingOrder.status,
        after_status: updatedStatus,
      });
    }
  }

  await logAdminEvent({
    route: "/api/admin/orders/status",
    actor: user.email,
    order_id: orderId,
    before_status: existingOrder.status,
    before_payment_status: existingOrder.payment_status,
    before_delivery_status: existingOrder.delivery_status,
    after_status: updatedStatus,
    after_payment_status: updated?.payment_status ?? patch.payment_status ?? existingOrder.payment_status,
    after_delivery_status: updated?.delivery_status ?? patch.delivery_status ?? existingOrder.delivery_status,
    note: note || undefined,
    ok: true,
  });

  return applyRateLimitHeaders(
    NextResponse.json({
      ok: true,
      order: updated || {
        id: existingOrder.id,
        status: patch.status ?? existingOrder.status,
        payment_status: patch.payment_status ?? existingOrder.payment_status,
        delivery_status: patch.delivery_status ?? existingOrder.delivery_status,
      },
    }),
    rl
  );
}
