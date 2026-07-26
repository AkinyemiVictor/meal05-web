import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { consumePaystackReference, readPaystackReference } from "@/lib/payments/paystack-reference";
import { normaliseText, verifyPaystackTransaction } from "@/lib/payments/paystack";
import { creditWalletOverpaymentChange } from "@/lib/wallet/server";

const normaliseEmail = (value) => normaliseText(value).toLowerCase();

const parseOrderIdFromReference = (reference) => {
  const raw = normaliseText(reference);
  const parts = raw.split("-");
  if (parts.length < 3 || parts[0] !== "MK") return "";

  const last = parts[parts.length - 1];
  const penultimate = parts[parts.length - 2];
  if (/^\d{8,}$/.test(last)) {
    return normaliseText(parts.slice(1, -1).join("-"));
  }
  if (/^\d{8,}$/.test(penultimate)) {
    return normaliseText(parts.slice(1, -2).join("-"));
  }
  return "";
};

const getPaymentAmountComparison = (amountKobo, orderTotal) => {
  const actual = Number(amountKobo);
  const expected = Math.round((Number(orderTotal) || 0) * 100);
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected < 0) {
    return { valid: false, underpaid: false, overpaid: false, expected, actual, differenceKobo: 0 };
  }
  const differenceKobo = Math.round(actual - expected);
  return {
    valid: actual + 1 >= expected,
    underpaid: actual + 1 < expected,
    overpaid: differenceKobo > 1,
    expected,
    actual,
    differenceKobo: Math.max(0, differenceKobo),
  };
};

const loadOrder = async (admin, orderId) => {
  const { data, error } = await admin
    .from("orders")
    .select("id, total, currency_code, payment_status, status, user_id, fulfillment_type, pickup_location_id, delivery_address")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 500, error: error.message || "Unable to load order", order: null };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Order not found", order: null };
  }
  return { ok: true, status: 200, error: null, order: data };
};

const loadOrderOwnerEmail = async (admin, userId) => {
  const key = normaliseText(userId);
  if (!key) return "";
  try {
    const { data, error } = await admin.auth.admin.getUserById(key);
    if (error) return "";
    return normaliseEmail(data?.user?.email);
  } catch {
    return "";
  }
};

export const applyVerifiedPaystackPayment = async ({ reference, providedOrderId, userId }) => {
  const normalizedReference = normaliseText(reference);
  const inputOrderId = normaliseText(providedOrderId);
  if (!normalizedReference) {
    return { ok: false, status: 400, error: "Missing reference", verified: false };
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return { ok: false, status: 500, error: "PAYSTACK_SECRET_KEY is not set" };
  }

  const verified = await verifyPaystackTransaction(normalizedReference, secret);
  if (!verified.ok) {
    return { ok: false, status: 400, error: verified.error || "Verification failed", verified: false };
  }

  const tx = verified.tx || {};
  const txReference = normaliseText(tx?.reference || normalizedReference);
  if (txReference !== normalizedReference) {
    return { ok: false, status: 409, error: "Payment reference mismatch", verified: false };
  }

  const issuedRef = await readPaystackReference(normalizedReference);
  const metadataOrderId = normaliseText(tx?.metadata?.orderId);
  const referenceOrderId = parseOrderIdFromReference(txReference);
  const transactionOrderId = metadataOrderId || referenceOrderId;
  const issuedOrderId = normaliseText(issuedRef?.orderId);

  if (issuedOrderId && transactionOrderId && issuedOrderId !== transactionOrderId) {
    return { ok: false, status: 409, error: "Payment does not match issued reference", verified: false };
  }
  if (issuedOrderId && inputOrderId && issuedOrderId !== inputOrderId) {
    return { ok: false, status: 409, error: "Payment does not match issued order", verified: false };
  }
  if (inputOrderId && transactionOrderId && inputOrderId !== transactionOrderId) {
    return { ok: false, status: 409, error: "Payment does not match the requested order", verified: false };
  }
  if (inputOrderId && !transactionOrderId) {
    return { ok: false, status: 409, error: "Payment metadata is missing order binding", verified: false };
  }

  const orderId = issuedOrderId || transactionOrderId || inputOrderId;
  if (!orderId) {
    return { ok: false, status: 400, error: "Missing orderId", verified: false };
  }

  const admin = getSupabaseAdminClient();
  const loaded = await loadOrder(admin, orderId);
  if (!loaded.ok) {
    return { ok: false, status: loaded.status, error: loaded.error, verified: false };
  }
  const order = loaded.order;
  const requestedUserId = normaliseText(userId);
  if (requestedUserId && normaliseText(order?.user_id) !== requestedUserId) {
    return { ok: false, status: 403, error: "Forbidden", verified: false };
  }

  const issuedUserId = normaliseText(issuedRef?.userId);
  if (issuedUserId && normaliseText(order?.user_id) !== issuedUserId) {
    return { ok: false, status: 409, error: "Payment does not match issued user", verified: false };
  }

  const payerEmail = normaliseEmail(tx?.customer?.email);
  const issuedEmail = normaliseEmail(issuedRef?.email);
  if (issuedEmail && payerEmail && payerEmail !== issuedEmail) {
    return { ok: false, status: 409, error: "Payment does not match issued customer", verified: false };
  }

  const ownerEmail = await loadOrderOwnerEmail(admin, order?.user_id);
  if (ownerEmail && payerEmail && ownerEmail !== payerEmail && !issuedEmail.endsWith("@customers.meal05.com")) {
    return { ok: false, status: 409, error: "Payment email does not match order owner", verified: false };
  }

  const issuedAmount = Number(issuedRef?.amountKobo);
  if (Number.isFinite(issuedAmount) && issuedAmount >= 0 && Number(tx?.amount) + 1 < issuedAmount) {
    return { ok: false, status: 409, error: "Payment does not match issued amount", verified: false };
  }

  const amountComparison = getPaymentAmountComparison(tx?.amount, order?.total);
  if (!amountComparison.valid) {
    return {
      ok: false,
      status: 409,
      error: amountComparison.underpaid ? "Payment is less than order total" : "Payment amount is invalid",
      verified: false,
    };
  }

  const currencyCode = normaliseText(tx?.currency || "NGN").toUpperCase();
  if (currencyCode !== normaliseText(order?.currency_code || "NGN").toUpperCase()) {
    return { ok: false, status: 409, error: "Payment currency does not match order currency", verified: false };
  }
  const { data: paymentResult, error: paymentErr } = await admin.rpc("mark_paystack_order_paid", {
    p_order_id: Number(orderId),
    p_transaction_ref: txReference,
    p_amount: Number(tx?.amount) / 100,
    p_currency_code: currencyCode,
  });
  if (paymentErr) {
    return {
      ok: false,
      status: /insufficient stock|different market|invalid item|has no items/i.test(paymentErr.message || "") ? 409 : 500,
      error: paymentErr.message || "Unable to finalize payment",
      verified: true,
      stockUpdated: false,
    };
  }

  let walletChangeCredit = null;
  if (amountComparison.overpaid) {
    try {
      walletChangeCredit = await creditWalletOverpaymentChange({
        admin,
        userId: order.user_id,
        orderId,
        amount: amountComparison.differenceKobo / 100,
        currencyCode,
        provider: "paystack",
        providerReference: txReference,
        idempotencyKey: `paystack:order:${orderId}:overpayment:${txReference}`,
      });
    } catch (error) {
      walletChangeCredit = {
        error: error?.message || "Unable to credit overpayment change",
        amount: amountComparison.differenceKobo / 100,
      };
    }
  }

  try {
    await consumePaystackReference(normalizedReference);
  } catch {}
  try {
    await admin.from("cart_items").delete().eq("user_id", order.user_id);
  } catch {}

  return {
    ok: true,
    status: 200,
    body: {
      verified: true,
      stockUpdated: paymentResult?.stock_updated === true,
      alreadyPaid: paymentResult?.already_processed === true,
      orderId,
      reference: txReference,
      amount: Number(order.total) || 0,
      paidAmount: Number(tx?.amount) / 100,
      walletChangeCredit,
      currency: currencyCode,
      paymentStatus: "paid",
      orderStatus: "processing",
      fulfillmentType: order.fulfillment_type || "",
      pickupLocationId: order.pickup_location_id ?? null,
      deliveryAddress: order.delivery_address || "",
    },
  };
};
