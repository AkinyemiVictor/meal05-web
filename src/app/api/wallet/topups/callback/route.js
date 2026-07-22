import { NextResponse } from "next/server";
import { applyVerifiedPaystackWalletTopup } from "@/lib/payments/paystack-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (value) => String(value ?? "").trim();

export async function GET(request) {
  const url = new URL(request.url);
  const reference = text(url.searchParams.get("reference") || url.searchParams.get("trxref"));
  const topupId = text(url.searchParams.get("topupId"));
  if (!reference && !topupId) {
    return NextResponse.redirect(new URL("/account/wallet?wallet=failed", url.origin));
  }

  const result = await applyVerifiedPaystackWalletTopup({ reference, topupId });
  if (!result.ok) {
    return NextResponse.redirect(
      new URL(`/account/wallet?wallet=failed&reason=${encodeURIComponent(result.error || "Verification failed")}`, url.origin)
    );
  }

  return NextResponse.redirect(new URL("/account/wallet?wallet=success", url.origin));
}
