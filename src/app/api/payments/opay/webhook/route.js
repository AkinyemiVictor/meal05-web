import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { logAdminError, logAdminEvent } from "@/lib/api/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const normaliseText = (value) => String(value ?? "").trim();

const verifySharedSecret = (request) => {
  const expected = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!expected) return false;
  const got = request.headers.get("x-webhook-secret") || request.headers.get("X-Webhook-Secret") || "";
  return Boolean(got && got === expected);
};

const readPayload = async (request) => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};

const resolveOrderId = (payload) =>
  normaliseText(
    payload?.orderId ||
      payload?.order_id ||
      payload?.merchantOrderNo ||
      payload?.merchant_order_no ||
      payload?.data?.orderId ||
      payload?.data?.order_id ||
      payload?.data?.merchantOrderNo ||
      payload?.data?.merchant_order_no ||
      payload?.data?.metadata?.orderId ||
      payload?.metadata?.orderId
  );

const resolvePaymentStatus = (payload) => {
  const raw = normaliseText(
    payload?.event ||
      payload?.status ||
      payload?.orderStatus ||
      payload?.paymentStatus ||
      payload?.data?.event ||
      payload?.data?.status ||
      payload?.data?.orderStatus ||
      payload?.data?.paymentStatus
  ).toLowerCase();

  if (["success", "successful", "paid", "completed", "charge.success"].includes(raw)) return "paid";
  if (["fail", "failed", "cancelled", "canceled", "expired", "closed", "abandoned"].includes(raw)) return "failed";
  return "";
};

export async function POST(request) {
  const admin = getSupabaseAdminClient();
  const payload = await readPayload(request);

  if (!verifySharedSecret(request)) {
    await logAdminError("Invalid OPay webhook signature", { route: "/api/payments/opay/webhook" });
    return json({ error: "Invalid signature" }, 401);
  }

  const orderId = resolveOrderId(payload);
  if (!orderId) return json({ error: "Missing orderId" }, 400);

  const paymentStatus = resolvePaymentStatus(payload);
  if (!paymentStatus) {
    await logAdminEvent({ route: "/api/payments/opay/webhook", order_id: orderId, event: "ignored" });
    return json({ ok: true, order_id: orderId, ignored: true });
  }

  const { data: existingOrder, error: findErr } = await admin
    .from("orders")
    .select("id, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (findErr) {
    await logAdminError(findErr, { route: "/api/payments/opay/webhook", order_id: orderId, stage: "load_order" });
    return json({ error: "Unable to load order" }, 500);
  }
  if (!existingOrder) return json({ error: "Order not found" }, 404);

  const currentPaymentStatus = normaliseText(existingOrder.payment_status).toLowerCase();
  if (currentPaymentStatus === "paid") {
    return json({ ok: true, order_id: orderId, payment_status: "paid", alreadyPaid: true });
  }

  const patch =
    paymentStatus === "paid"
      ? { payment_status: "paid", status: "processing" }
      : { payment_status: "failed", status: "payment_failed" };

  const { error: updateErr } = await admin.from("orders").update(patch).eq("id", orderId);
  if (updateErr) {
    await logAdminError(updateErr, { route: "/api/payments/opay/webhook", order_id: orderId, stage: "update_order" });
    return json({ error: "Unable to update order" }, 500);
  }

  if (paymentStatus === "paid") {
    const { error: stockErr } = await admin.rpc("deduct_stock_for_order", { order_id_input: orderId });
    if (stockErr) {
      await logAdminError(stockErr, { route: "/api/payments/opay/webhook", order_id: orderId, stage: "deduct_stock" });
      try {
        await admin.from("orders").update({ status: "stock_failed" }).eq("id", orderId);
      } catch {}
      return json({ error: stockErr.message || "Stock deduction failed" }, 409);
    }
  }

  await logAdminEvent({ route: "/api/payments/opay/webhook", order_id: orderId, payment_status: paymentStatus });
  return json({ ok: true, order_id: orderId, payment_status: paymentStatus });
}

export async function PUT(request) {
  return POST(request);
}
