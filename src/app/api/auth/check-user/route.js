import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Endpoint intentionally retired to avoid account-enumeration leaks.
export async function POST() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

