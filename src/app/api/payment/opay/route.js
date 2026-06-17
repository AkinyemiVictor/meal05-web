import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const disabled = () =>
  NextResponse.json(
    {
      error: "OPay API integration is temporarily disabled pending secure webhook verification.",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    }
  );

export async function POST() {
  return disabled();
}

export async function PUT() {
  return disabled();
}
