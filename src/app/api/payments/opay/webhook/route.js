import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { logAdminError, logAdminEvent } from "@/lib/api/log";
import { creditWalletOverpaymentChange } from "@/lib/wallet/server";

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

const resolvePaymentReference = (payload) =>
  normaliseText(
    payload?.reference ||
      payload?.transactionReference ||
      payload?.transaction_reference ||
      payload?.transactionId ||
      payload?.transaction_id ||
      payload?.data?.reference ||
      payload?.data?.transactionReference ||
      payload?.data?.transaction_reference ||
      payload?.data?.transactionId ||
      payload?.data?.transaction_id ||
      payload?.data?.orderNo ||
      payload?.data?.order_no
  );

const resolvePaidAmount = (payload, orderTotal) => {
  const candidates = [
    payload?.paidAmount,
    payload?.paid_amount,
    payload?.amountPaid,
    payload?.amount_paid,
    payload?.amount,
    payload?.totalAmount,
    payload?.total_amount,
    payload?.data?.paidAmount,
    payload?.data?.paid_amount,
    payload?.data?.amountPaid,
    payload?.data?.amount_paid,
    payload?.data?.amount,
    payload?.data?.totalAmount,
    payload?.data?.total_amount,
  ];

  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    const expected = Number(orderTotal) || 0;
    if (expected > 0 && numeric > expected * 20 && numeric / 100 >= expected - 0.01) {
      return Math.round((numeric / 100) * 100) / 100;
    }
    return Math.round(numeric * 100) / 100;
  }
  return null;
};

const comparePaidAmount = (paidAmount, orderTotal) => {
  const actual = Math.round((Number(paidAmount) || 0) * 100);
  const expected = Math.round((Number(orderTotal) || 0) * 100);
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected < 0 || actual <= 0) {
    return { valid: false, underpaid: false, overpaid: false, difference: 0 };
  }
  const differenceKobo = actual - expected;
  return {
    valid: actual + 1 >= expected,
    underpaid: actual + 1 < expected,
    overpaid: differenceKobo > 1,
    difference: Math.max(0, differenceKobo) / 100,
  };
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
    .select("id, payment_status, total, currency_code, user_id")
    .eq("id", orderId)
    .maybeSingle();
  if (findErr) {
    await logAdminError(findErr, { route: "/api/payments/opay/webhook", order_id: orderId, stage: "load_order" });
    return json({ error: "Unable to load order" }, 500);
  }
  if (!existingOrder) return json({ error: "Order not found" }, 404);

  const paidAmount = paymentStatus === "paid" ? resolvePaidAmount(payload, existingOrder.total) : null;
  const amountComparison = paymentStatus === "paid" ? comparePaidAmount(paidAmount, existingOrder.total) : null;
  if (paymentStatus === "paid" && !amountComparison.valid) {
    await admin
      .from("orders")
      .update({ payment_status: "failed", status: "payment_failed" })
      .eq("id", orderId)
      .neq("payment_status", "paid");
    await logAdminEvent({
      route: "/api/payments/opay/webhook",
      order_id: orderId,
      provider: "opay",
      payment_status: "failed",
      event: amountComparison.underpaid ? "underpayment_rejected" : "missing_or_invalid_amount",
      paid_amount: paidAmount,
      expected_amount: existingOrder.total,
    });
    return json(
      { error: amountComparison.underpaid ? "Payment is less than order total" : "Payment amount is required" },
      409
    );
  }

  const currentPaymentStatus = normaliseText(existingOrder.payment_status).toLowerCase();
  const paymentReference = resolvePaymentReference(payload) || `opay-order-${orderId}`;
  if (currentPaymentStatus === "paid") {
    if (paymentStatus === "paid" && amountComparison?.overpaid) {
      try {
        await creditWalletOverpaymentChange({
          admin,
          userId: existingOrder.user_id,
          orderId,
          amount: amountComparison.difference,
          currencyCode: existingOrder.currency_code || "NGN",
          provider: "opay",
          providerReference: paymentReference,
          idempotencyKey: `opay:order:${orderId}:overpayment:${paymentReference}`,
        });
      } catch (error) {
        await logAdminError(error, { route: "/api/payments/opay/webhook", order_id: orderId, stage: "wallet_change_credit" });
      }
    }
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

    if (amountComparison?.overpaid) {
      try {
        await creditWalletOverpaymentChange({
          admin,
          userId: existingOrder.user_id,
          orderId,
          amount: amountComparison.difference,
          currencyCode: existingOrder.currency_code || "NGN",
          provider: "opay",
          providerReference: paymentReference,
          idempotencyKey: `opay:order:${orderId}:overpayment:${paymentReference}`,
        });
      } catch (error) {
        await logAdminError(error, { route: "/api/payments/opay/webhook", order_id: orderId, stage: "wallet_change_credit" });
      }
    }
  }

  await logAdminEvent({
    route: "/api/payments/opay/webhook",
    order_id: orderId,
    payment_status: paymentStatus,
    paid_amount: paidAmount,
    overpayment_change: amountComparison?.overpaid ? amountComparison.difference : 0,
  });
  return json({
    ok: true,
    order_id: orderId,
    payment_status: paymentStatus,
    paidAmount,
    walletChangeAmount: amountComparison?.overpaid ? amountComparison.difference : 0,
  });
}

export async function PUT(request) {
  return POST(request);
}
