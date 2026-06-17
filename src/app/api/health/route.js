import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() }, { status: 200 });
}

export function HEAD() {
  return new Response(null, { status: 200 });
}
