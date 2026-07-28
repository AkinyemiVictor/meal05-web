import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const disabled = () =>
  NextResponse.json(
    {
      error: "This payment method is currently unavailable.",
      code: "PAYMENT_METHOD_DISABLED",
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache", Expires: "0" },
    }
  );

export async function POST() {
  return disabled();
}

export async function PUT() {
  return disabled();
}
