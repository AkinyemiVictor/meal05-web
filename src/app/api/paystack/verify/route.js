import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { applyVerifiedPaystackPayment } from "@/lib/payments/paystack-verify";

export const runtime = "nodejs";

const normaliseText = (value) => String(value ?? "").trim();

const markOrderPaymentFailed = async (orderId) => {
  const normalizedOrderId = normaliseText(orderId);
  if (!normalizedOrderId) return;
  try {
    await getSupabaseAdminClient()
      .from("orders")
      .update({ payment_status: "failed", status: "payment_failed" })
      .eq("id", normalizedOrderId)
      .neq("payment_status", "paid");
  } catch {}
};

export async function POST(req) {
  try {
    const body = await req.json();
    const reference = normaliseText(body?.reference);
    const orderId = normaliseText(body?.orderId);
    if (!reference || !orderId) {
      return NextResponse.json({ error: "Missing reference or orderId" }, { status: 400 });
    }

    const result = await applyVerifiedPaystackPayment({ reference, providedOrderId: orderId });
    if (!result.ok) {
      if (orderId && !result.verified) {
        await markOrderPaymentFailed(orderId);
      }
      return NextResponse.json(
        {
          verified: Boolean(result.verified),
          stockUpdated: result.stockUpdated ?? false,
          error: result.error,
        },
        { status: result.status || 400 }
      );
    }
    return NextResponse.json(result.body, { status: result.status || 200 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const reference = normaliseText(url.searchParams.get("reference"));
    const providedOrderId = normaliseText(url.searchParams.get("orderId"));

    if (!reference) {
      return NextResponse.redirect(new URL("/checkout/failure?reason=Missing+reference", url.origin));
    }

    const result = await applyVerifiedPaystackPayment({ reference, providedOrderId });
    if (!result.ok) {
      const reason = encodeURIComponent(result.error || "Verification failed");
      return NextResponse.redirect(new URL(`/checkout/failure?reason=${reason}`, url.origin));
    }

    return NextResponse.redirect(new URL("/checkout/success", url.origin));
  } catch (error) {
    const url = new URL(req.url);
    return NextResponse.redirect(
      new URL(`/checkout/failure?reason=${encodeURIComponent(error?.message || "Server error")}`, url.origin)
    );
  }
}
