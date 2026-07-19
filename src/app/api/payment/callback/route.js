import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { logAdminError, logAdminEvent } from "@/lib/api/log";
import { applyVerifiedPaystackPayment } from "@/lib/payments/paystack-verify";
import { applyVerifiedPaystackWalletTopup } from "@/lib/payments/paystack-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200, headers = {}) => NextResponse.json(body, { status, headers });
const normaliseText = (value) => String(value ?? "").trim();

const verifyPaystackSignature = (bodyRaw, signature) => {
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  if (!secret || !signature) return false;
  const hash = crypto.createHmac("sha512", secret).update(bodyRaw).digest("hex");
  return hash === signature;
};

const readTextBody = async (request) => {
  try {
    return await request.text();
  } catch {
    return "";
  }
};

const resolveOrderId = (payload) =>
  normaliseText(
    payload?.orderId ||
      payload?.order_id ||
      payload?.data?.metadata?.orderId ||
      payload?.metadata?.orderId
  );

const resolveReference = (payload) =>
  normaliseText(
    payload?.reference ||
      payload?.data?.reference ||
      payload?.data?.trxref ||
      payload?.trxref
  );

const resolveEvent = (payload) =>
  normaliseText(payload?.event || payload?.data?.status || payload?.status).toLowerCase();

const resolvePurpose = (payload) =>
  normaliseText(payload?.data?.metadata?.purpose || payload?.metadata?.purpose).toLowerCase();

const resolveWalletTopupId = (payload) =>
  normaliseText(payload?.data?.metadata?.walletTopupId || payload?.metadata?.walletTopupId || payload?.walletTopupId);

export async function POST(request) {
  const admin = getSupabaseAdminClient();
  const bodyRaw = await readTextBody(request);
  let payload;
  try {
    payload = JSON.parse(bodyRaw || "{}");
  } catch {
    payload = {};
  }

  const paystackSignature = request.headers.get("x-paystack-signature");
  const provider = normaliseText(payload?.provider || request.headers.get("x-provider") || (paystackSignature ? "paystack" : "")).toLowerCase();
  if (provider && provider !== "paystack") {
    await logAdminEvent({ route: "/api/payment/callback", provider, event: "unsupported_provider" });
    return json({ error: "Unsupported provider. Use the provider-specific webhook route." }, 410);
  }

  if (!verifyPaystackSignature(bodyRaw, paystackSignature)) {
    await logAdminError("Invalid Paystack webhook signature", { route: "/api/payment/callback", provider: "paystack" });
    return json({ error: "Invalid signature" }, 401);
  }

  const event = resolveEvent(payload);
  const paidStatuses = new Set(["charge.success", "success", "successful", "paid"]);
  const failedStatuses = new Set(["failed", "charge.failed", "abandoned", "reversed"]);

  if (resolvePurpose(payload) === "wallet_topup") {
    const reference = resolveReference(payload);
    const topupId = resolveWalletTopupId(payload);
    if (!reference && !topupId) return json({ error: "Missing top-up reference" }, 400);

    if (!paidStatuses.has(event)) {
      await logAdminEvent({ route: "/api/payment/callback", provider: "paystack", event, wallet_topup_id: topupId || null, payment_status: failedStatuses.has(event) ? "failed" : "ignored" });
      return json({ ok: true, wallet_topup_id: topupId || null, ignored: !failedStatuses.has(event) });
    }

    const result = await applyVerifiedPaystackWalletTopup({ reference, topupId });
    if (!result.ok) {
      await logAdminError(result.error || "Paystack wallet webhook verification failed", {
        route: "/api/payment/callback",
        wallet_topup_id: topupId || null,
        reference,
      });
      return json({ verified: Boolean(result.verified), error: result.error || "Verification failed" }, result.status || 400);
    }

    await logAdminEvent({
      route: "/api/payment/callback",
      wallet_topup_id: result.body?.topupId || topupId || null,
      provider: "paystack",
      event,
      payment_status: "paid",
    });
    return json({ ok: true, wallet_topup_id: result.body?.topupId || topupId || null, verified: true, alreadyProcessed: result.body?.alreadyProcessed === true });
  }

  const orderId = resolveOrderId(payload);
  if (!orderId) return json({ error: "Missing orderId" }, 400);

  if (!paidStatuses.has(event) && !failedStatuses.has(event)) {
    await logAdminEvent({ route: "/api/payment/callback", order_id: orderId, provider: "paystack", event, payment_status: "ignored" });
    return json({ ok: true, order_id: orderId, ignored: true });
  }

  if (paidStatuses.has(event)) {
    const reference = resolveReference(payload);
    if (!reference) {
      await logAdminError("Missing Paystack reference in webhook payload", { route: "/api/payment/callback", order_id: orderId });
      return json({ error: "Missing payment reference" }, 400);
    }

    const result = await applyVerifiedPaystackPayment({ reference, providedOrderId: orderId });
    if (!result.ok) {
      await logAdminError(result.error || "Paystack webhook verification failed", {
        route: "/api/payment/callback",
        order_id: orderId,
        reference,
      });
      return json(
        {
          verified: Boolean(result.verified),
          stockUpdated: result.stockUpdated ?? false,
          error: result.error || "Verification failed",
        },
        { status: result.status || 400 }
      );
    }

    await logAdminEvent({
      route: "/api/payment/callback",
      order_id: result.body?.orderId || orderId,
      provider: "paystack",
      event,
      payment_status: "paid",
    });
    return json({
      ok: true,
      order_id: result.body?.orderId || orderId,
      payment_status: "paid",
      verified: true,
      alreadyPaid: result.body?.alreadyPaid === true,
    });
  }

  const { data: existingOrder, error: findErr } = await admin
    .from("orders")
    .select("id, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (findErr) {
    await logAdminError(findErr, { route: "/api/payment/callback", order_id: orderId, provider: "paystack", stage: "load_order" });
    return json({ error: "Unable to load order" }, 500);
  }
  if (!existingOrder) return json({ error: "Order not found" }, 404);

  const currentPaymentStatus = normaliseText(existingOrder.payment_status).toLowerCase();
  if (currentPaymentStatus === "paid") {
    return json({ ok: true, order_id: orderId, payment_status: "paid", alreadyPaid: true });
  }

  const { error: updateErr } = await admin
    .from("orders")
    .update({ payment_status: "failed", status: "payment_failed" })
    .eq("id", orderId)
    .neq("payment_status", "paid");
  if (updateErr) {
    await logAdminError(updateErr, { route: "/api/payment/callback", order_id: orderId, provider: "paystack", stage: "update_order" });
    return json({ error: "Unable to update order" }, 500);
  }

  await logAdminEvent({ route: "/api/payment/callback", order_id: orderId, provider: "paystack", event, payment_status: "failed" });
  return json({ ok: true, order_id: orderId, payment_status: "failed" });
}
