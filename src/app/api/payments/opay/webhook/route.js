import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { logAdminError, logAdminEvent } from "@/lib/api/log";
import { creditWalletOverpaymentChange } from "@/lib/wallet/server";
import { PAYMENT_METHOD_DISABLED, isProviderUsable, loadPaymentProvider } from "@/lib/payments/provider-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache", Expires: "0" },
  });
const normaliseText = (value) => String(value ?? "").trim();

const timingSafeEqualText = (left, right) => {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const getOpayCallbackPayload = (body) =>
  body?.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : null;

const stringifyCallbackField = (value) => String(value ?? "").trim();

const opayRefundedFlag = (value) => {
  if (value === true) return "t";
  const text = stringifyCallbackField(value).toLowerCase();
  return text === "true" || text === "t" || text === "1" ? "t" : "f";
};

const buildOpayCallbackSignaturePayload = (body) => {
  const event = getOpayCallbackPayload(body);
  if (!event) return "";
  return `{Amount:"${stringifyCallbackField(event.amount)}",Currency:"${stringifyCallbackField(event.currency)}",Reference:"${stringifyCallbackField(event.reference)}",Refunded:${opayRefundedFlag(event.refunded)},Status:"${stringifyCallbackField(event.status)}",Timestamp:"${stringifyCallbackField(event.timestamp)}",Token:"${stringifyCallbackField(event.token)}",TransactionID:"${stringifyCallbackField(event.transactionId)}"}`;
};

const verifyOpayCallbackSignature = (body) => {
  const privateKey = process.env.OPAY_MERCHANT_PRIVATE_KEY || "";
  const receivedSignature = stringifyCallbackField(body?.sha512).toLowerCase();
  const signaturePayload = buildOpayCallbackSignaturePayload(body);
  if (!privateKey || !receivedSignature || !signaturePayload) return false;
  let expected = "";
  try {
    expected = crypto.createHmac("sha3-512", privateKey).update(signaturePayload).digest("hex");
  } catch {
    return false;
  }
  return timingSafeEqualText(receivedSignature.toLowerCase(), expected.toLowerCase());
};

const verifySharedSecret = (request) => {
  const expected = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!expected) return false;
  const got = request.headers.get("x-webhook-secret") || request.headers.get("X-Webhook-Secret") || "";
  return Boolean(got && timingSafeEqualText(got, expected));
};

const readPayload = (rawBody) => {
  try {
    return JSON.parse(rawBody || "{}");
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
      payload?.payload?.orderId ||
      payload?.payload?.order_id ||
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
      payload?.payload?.status ||
      payload?.payload?.event ||
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
      payload?.payload?.reference ||
      payload?.payload?.transactionId ||
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
    payload?.payload?.amount,
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

const resolveCurrency = (payload) =>
  normaliseText(
    payload?.currency ||
      payload?.currencyCode ||
      payload?.currency_code ||
      payload?.payload?.currency ||
      payload?.data?.currency ||
      payload?.data?.currencyCode ||
      payload?.data?.currency_code ||
      payload?.amount?.currency ||
      payload?.data?.amount?.currency
  ).toUpperCase();

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

const selectPaymentFields =
  "id, reference, transaction_ref, user_id, order_id, wallet_topup_id, amount, currency, status, provider_code";

const findCallbackPayments = async (admin, { orderId, reference }) => {
  const matches = new Map();
  const addRows = (rows) => {
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (row?.id != null) matches.set(String(row.id), row);
    });
  };

  if (reference) {
    const byReference = await admin
      .from("payments")
      .select(selectPaymentFields)
      .eq("reference", reference)
      .in("provider_code", ["opay_gateway", "opay_transfer"]);
    if (byReference.error) return { rows: [], error: byReference.error };
    addRows(byReference.data);

    const byTransactionReference = await admin
      .from("payments")
      .select(selectPaymentFields)
      .eq("transaction_ref", reference)
      .in("provider_code", ["opay_gateway", "opay_transfer"]);
    if (byTransactionReference.error) return { rows: [], error: byTransactionReference.error };
    addRows(byTransactionReference.data);
  }

  const numericOrderId = Number(orderId);
  if (!matches.size && Number.isSafeInteger(numericOrderId) && numericOrderId > 0) {
    const byOrder = await admin
      .from("payments")
      .select(selectPaymentFields)
      .eq("order_id", numericOrderId)
      .in("provider_code", ["opay_gateway", "opay_transfer"]);
    if (byOrder.error) return { rows: [], error: byOrder.error };
    addRows(byOrder.data);
  }

  return { rows: Array.from(matches.values()), error: null };
};

export async function POST(request) {
  const admin = getSupabaseAdminClient();
  const rawBody = await request.text();
  const payload = readPayload(rawBody);

  const gatewayProvider = await loadPaymentProvider(admin, "opay_gateway").catch(() => null);
  const transferProvider = await loadPaymentProvider(admin, "opay_transfer").catch(() => null);
  if (!isProviderUsable(gatewayProvider, "checkout") && !isProviderUsable(transferProvider, "checkout")) {
    await logAdminEvent({ route: "/api/payments/opay/webhook", provider: "opay", event: "disabled_provider_rejected" });
    return json(PAYMENT_METHOD_DISABLED, 503);
  }

  const hasOpayPrivateKey = Boolean(process.env.OPAY_MERCHANT_PRIVATE_KEY);
  if (!verifyOpayCallbackSignature(payload) && !(hasOpayPrivateKey === false && verifySharedSecret(request))) {
    await logAdminError("Invalid OPay webhook signature", { route: "/api/payments/opay/webhook" });
    return json({ error: "Invalid signature" }, 401);
  }

  let orderId = resolveOrderId(payload);
  const paymentReference = resolvePaymentReference(payload);
  const { rows: callbackPayments, error: paymentLookupError } = await findCallbackPayments(admin, {
    orderId,
    reference: paymentReference,
  });
  if (paymentLookupError) {
    await logAdminError(paymentLookupError, { route: "/api/payments/opay/webhook", stage: "load_payment" });
    return json({ error: "Unable to load payment" }, 500);
  }
  if (callbackPayments.length > 1) {
    await logAdminError("Ambiguous OPay callback payment reference", {
      route: "/api/payments/opay/webhook",
      reference: paymentReference,
      order_id: orderId || null,
      count: callbackPayments.length,
    });
    return json({ error: "Payment reference matched more than one record." }, 409);
  }
  const callbackPayment = callbackPayments[0] || null;
  if (!callbackPayment) {
    await logAdminError("OPay callback payment reference not found", {
      route: "/api/payments/opay/webhook",
      reference: paymentReference,
      order_id: orderId || null,
    });
    return json({ error: "Payment record not found." }, 404);
  }
  if (!orderId && callbackPayment?.order_id != null) {
    orderId = String(callbackPayment.order_id);
  }
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
  const paidCurrency = paymentStatus === "paid" ? resolveCurrency(payload) : "";
  const expectedCurrency = normaliseText(existingOrder.currency_code || "NGN").toUpperCase() || "NGN";
  if (paymentStatus === "paid" && (!paidCurrency || paidCurrency !== expectedCurrency)) {
    await logAdminEvent({
      route: "/api/payments/opay/webhook",
      order_id: orderId,
      provider: "opay",
      payment_status: "failed",
      event: paidCurrency ? "currency_mismatch_rejected" : "missing_currency_rejected",
      paid_currency: paidCurrency,
      expected_currency: expectedCurrency,
    });
    return json({ error: "The verified currency does not match this order." }, 409);
  }
  const amountComparison = paymentStatus === "paid" ? comparePaidAmount(paidAmount, existingOrder.total) : null;
  if (paymentStatus === "paid" && !amountComparison.valid) {
    await admin
      .from("orders")
      .update({ payment_status: "failed", status: "payment_failed" })
      .eq("id", orderId)
      .neq("payment_status", "paid");
    await admin
      .from("payments")
      .update({
        status: "failed",
        rejected_at: new Date().toISOString(),
        rejection_reason: amountComparison.underpaid
          ? "The verified amount does not match this order."
          : "Payment amount is required.",
        provider_reference: paymentReference || `opay-order-${orderId}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", callbackPayment.id)
      .select("id");
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
      { error: amountComparison.underpaid ? "The verified amount does not match this order." : "Payment amount is required." },
      409
    );
  }

  const currentPaymentStatus = normaliseText(existingOrder.payment_status).toLowerCase();
  const providerReference = paymentReference || `opay-order-${orderId}`;
  if (currentPaymentStatus === "paid") {
    if (callbackPayment) {
      await admin
        .from("payments")
        .update({
          status: "verified",
          verified_at: new Date().toISOString(),
          provider_reference: providerReference,
          updated_at: new Date().toISOString(),
        })
        .eq("id", callbackPayment.id);
    }
    if (paymentStatus === "paid" && amountComparison?.overpaid) {
      try {
        await creditWalletOverpaymentChange({
          admin,
          userId: existingOrder.user_id,
          orderId,
          amount: amountComparison.difference,
          currencyCode: existingOrder.currency_code || "NGN",
          provider: "opay",
          providerReference,
          idempotencyKey: `opay:order:${orderId}:overpayment:${providerReference}`,
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

  if (callbackPayment) {
    const paymentPatch =
      paymentStatus === "paid"
        ? {
            status: "verified",
            verified_at: new Date().toISOString(),
            provider_reference: providerReference,
            updated_at: new Date().toISOString(),
          }
        : {
            status: "failed",
            rejected_at: new Date().toISOString(),
            rejection_reason: "OPay callback reported payment failure.",
            provider_reference: providerReference,
            updated_at: new Date().toISOString(),
          };
    const { data: updatedPayments, error: paymentUpdateError } = await admin
      .from("payments")
      .update(paymentPatch)
      .eq("id", callbackPayment.id)
      .select("id");
    if (paymentUpdateError) {
      await logAdminError(paymentUpdateError, { route: "/api/payments/opay/webhook", order_id: orderId, stage: "update_payment" });
      return json({ error: "Unable to update payment" }, 500);
    }
    if (!Array.isArray(updatedPayments) || updatedPayments.length !== 1) {
      await logAdminError("OPay callback did not update exactly one payment record", {
        route: "/api/payments/opay/webhook",
        order_id: orderId,
        payment_id: callbackPayment.id,
        count: Array.isArray(updatedPayments) ? updatedPayments.length : 0,
      });
      return json({ error: "Payment update count mismatch." }, 409);
    }
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
          providerReference,
          idempotencyKey: `opay:order:${orderId}:overpayment:${providerReference}`,
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
    paymentId: callbackPayment?.id || null,
    walletChangeAmount: amountComparison?.overpaid ? amountComparison.difference : 0,
  });
}

export async function PUT(request) {
  return POST(request);
}
