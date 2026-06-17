import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { logAdminError, logAdminEvent } from "@/lib/api/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200, headers = {}) => NextResponse.json(body, { status, headers });

const textBody = async (req) => {
  try { return await req.text(); } catch { return ""; }
};

function verifyPaystack(bodyRaw, signature) {
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  if (!secret || !signature) return false;
  const hash = crypto.createHmac("sha512", secret).update(bodyRaw).digest("hex");
  return hash === signature;
}

function verifyFlutterwave(signature) {
  const secretHash = process.env.FLW_SECRET_HASH || "";
  if (!secretHash || !signature) return false;
  return secretHash === signature;
}

function verifySharedSecret(req) {
  const expected = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!expected) return false;
  const got = req.headers.get("x-webhook-secret") || req.headers.get("X-Webhook-Secret") || "";
  return got && expected && got === expected;
}

export async function POST(req) {
  const admin = getSupabaseAdminClient();
  const bodyRaw = await textBody(req);
  let payload;
  try {
    payload = JSON.parse(bodyRaw || "{}");
  } catch {
    payload = {};
  }

  const paystackSig = req.headers.get("x-paystack-signature");
  const flwSig = req.headers.get("verif-hash");

  const provider = (payload?.provider || req.headers.get("x-provider") || "").toString().toLowerCase();
  const valid = (
    (provider === "paystack" && verifyPaystack(bodyRaw, paystackSig)) ||
    (provider === "flutterwave" && verifyFlutterwave(flwSig)) ||
    verifySharedSecret(req)
  );

  if (!valid) {
    await logAdminError("Invalid webhook signature", { route: "/api/payment/callback", provider });
    return json({ error: "Invalid signature" }, 401);
  }

  const event = payload?.event || payload?.data?.status || payload?.status || "";
  const schema = z.object({ orderId: z.union([z.string(), z.number()]).optional() }).passthrough();
  const parsed = schema.safeParse(payload);
  const orderIdValue = parsed.success ? (parsed.data.orderId ?? payload?.data?.metadata?.orderId) : (payload?.data?.metadata?.orderId);
  const orderId = String(orderIdValue || "").trim();
  if (!orderId) return json({ error: "Missing orderId" }, 400);

  const paidStatuses = new Set(["charge.success", "successful", "success", "paid"]);
  const failedStatuses = new Set(["failed", "charge.failed", "abandoned", "reversed"]);
  let payment_status = "pending";
  if (paidStatuses.has(event)) payment_status = "paid";
  else if (failedStatuses.has(event)) payment_status = "failed";

  try {
    const { error } = await admin.from("orders").update({ payment_status }).eq("id", orderId);
    if (error) throw error;
  } catch (err) {
    await logAdminError(err, { route: "/api/payment/callback", order_id: orderId, provider, event });
    return json({ error: "Unable to update order" }, 500);
  }

  if (payment_status === "paid") {
    const { error: stockErr } = await admin.rpc("deduct_stock_for_order", { order_id_input: orderId });
    if (stockErr) {
      await logAdminError(stockErr, { route: "/api/payment/callback", order_id: orderId, provider, event, stage: "deduct_stock" });
      try { await admin.from("orders").update({ status: "stock_failed" }).eq("id", orderId); } catch {}
      return json({ error: stockErr.message || "Stock deduction failed" }, 409);
    }
  }

  await logAdminEvent({ route: "/api/payment/callback", order_id: orderId, provider, event, payment_status });
  return json({ ok: true, order_id: orderId, payment_status });
}
