import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { readPaystackReference, consumePaystackReference } from "@/lib/payments/paystack-reference";

export const runtime = "nodejs";

const normaliseText = (value) => String(value ?? "").trim();
const normaliseEmail = (value) => normaliseText(value).toLowerCase();

const parseOrderIdFromReference = (reference) => {
  const raw = normaliseText(reference);
  // Supported formats:
  // - MK-{orderId}-{timestamp}
  // - MK-{orderId}-{timestamp}-{nonce}
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

const amountMatchesOrder = (amountKobo, orderTotal) => {
  const actual = Number(amountKobo);
  const expected = Math.round((Number(orderTotal) || 0) * 100);
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected < 0) return false;
  return Math.abs(actual - expected) <= 1;
};

async function verifyPaystackTransaction(reference, secret) {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  const tx = payload?.data || {};
  const isSuccess = Boolean(payload?.status) && tx?.status === "success";
  return {
    ok: isSuccess,
    statusCode: res.status,
    payload,
    tx,
    error: isSuccess ? null : normaliseText(payload?.message || "Verification failed"),
  };
}

async function loadOrder(admin, orderId) {
  const { data, error } = await admin
    .from("orders")
    .select("id, total, payment_status, status, user_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 500, error: error.message || "Unable to load order", order: null };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Order not found", order: null };
  }
  return { ok: true, status: 200, error: null, order: data };
}

async function loadOrderOwnerEmail(admin, userId) {
  const key = normaliseText(userId);
  if (!key) return "";
  try {
    const { data, error } = await admin.auth.admin.getUserById(key);
    if (error) return "";
    return normaliseEmail(data?.user?.email);
  } catch {
    return "";
  }
}

async function applyVerifiedPayment({ reference, providedOrderId }) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return { ok: false, status: 500, error: "PAYSTACK_SECRET_KEY is not set" };
  }

  const verified = await verifyPaystackTransaction(reference, secret);
  if (!verified.ok) {
    return { ok: false, status: 400, error: verified.error || "Verification failed", verified: false };
  }

  const tx = verified.tx || {};
  const txReference = normaliseText(tx?.reference || reference);
  if (txReference !== reference) {
    return { ok: false, status: 409, error: "Payment reference mismatch", verified: false };
  }

  const issuedRef = await readPaystackReference(reference);
  const metadataOrderId = normaliseText(tx?.metadata?.orderId);
  const referenceOrderId = parseOrderIdFromReference(tx?.reference || reference);
  const transactionOrderId = metadataOrderId || referenceOrderId;
  const inputOrderId = normaliseText(providedOrderId);
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

  const issuedUserId = normaliseText(issuedRef?.userId);
  if (issuedUserId && normaliseText(order?.user_id) !== issuedUserId) {
    return { ok: false, status: 409, error: "Payment does not match issued user", verified: false };
  }

  const ownerEmail = await loadOrderOwnerEmail(admin, order?.user_id);
  const payerEmail = normaliseEmail(tx?.customer?.email);
  if (!ownerEmail || !payerEmail || ownerEmail !== payerEmail) {
    return { ok: false, status: 409, error: "Payment email does not match order owner", verified: false };
  }

  const issuedEmail = normaliseEmail(issuedRef?.email);
  if (issuedEmail && ownerEmail !== issuedEmail) {
    return { ok: false, status: 409, error: "Payment does not match issued customer", verified: false };
  }

  const issuedAmount = Number(issuedRef?.amountKobo);
  if (Number.isFinite(issuedAmount) && issuedAmount >= 0 && Number(tx?.amount) !== issuedAmount) {
    return { ok: false, status: 409, error: "Payment does not match issued amount", verified: false };
  }

  if (!amountMatchesOrder(tx?.amount, order?.total)) {
    return { ok: false, status: 409, error: "Payment amount does not match order total", verified: false };
  }

  const currencyCode = normaliseText(tx?.currency || "NGN").toUpperCase();
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

  try {
    await consumePaystackReference(reference);
  } catch {}

  return {
    ok: true,
    status: 200,
    body: {
      verified: true,
      stockUpdated: paymentResult?.stock_updated === true,
      alreadyPaid: paymentResult?.already_processed === true,
      data: tx,
      orderId,
    },
  };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const reference = normaliseText(body?.reference);
    const orderId = normaliseText(body?.orderId);
    if (!reference || !orderId) {
      return NextResponse.json({ error: "Missing reference or orderId" }, { status: 400 });
    }

    const result = await applyVerifiedPayment({ reference, providedOrderId: orderId });
    if (!result.ok) {
      if (orderId && !result.verified) {
        try {
          await getSupabaseAdminClient()
            .from("orders")
            .update({ payment_status: "failed", status: "payment_failed" })
            .eq("id", orderId)
            .neq("payment_status", "paid");
        } catch {}
      }
      const payload = { verified: Boolean(result.verified), stockUpdated: result.stockUpdated ?? false, error: result.error };
      return NextResponse.json(payload, { status: result.status || 400 });
    }
    return NextResponse.json(result.body, { status: result.status || 200 });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

// Support redirect-based verification: /api/paystack/verify?reference=...&orderId=...
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const reference = normaliseText(url.searchParams.get("reference"));
    const providedOrderId = normaliseText(url.searchParams.get("orderId"));

    if (!reference) {
      return NextResponse.redirect(new URL("/checkout/failure?reason=Missing+reference", url.origin));
    }

    const result = await applyVerifiedPayment({ reference, providedOrderId });
    if (!result.ok) {
      const reason = encodeURIComponent(result.error || "Verification failed");
      return NextResponse.redirect(new URL(`/checkout/failure?reason=${reason}`, url.origin));
    }

    return NextResponse.redirect(new URL("/checkout/success", url.origin));
  } catch (e) {
    const url = new URL(req.url);
    return NextResponse.redirect(
      new URL(`/checkout/failure?reason=${encodeURIComponent(e?.message || "Server error")}`, url.origin)
    );
  }
}
