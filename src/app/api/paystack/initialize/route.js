import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const retired = () =>
  NextResponse.json(
    {
      error: "Endpoint retired. Use /api/paystack/session for authenticated payment sessions.",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    }
  );

export async function POST() {
  return retired();
}
