import { NextResponse } from "next/server";
import { attachProofPhotoByToken } from "@/lib/delivery/management";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const send = (response, rl) => applyRateLimitHeaders(withNoStore(response), rl);

export async function POST(req, { params }) {
  const { token } = await params;
  const rl = await checkRateLimit({ request: req, id: `rider:proof-photo:${token.slice(0, 12)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return send(NextResponse.json({ error: "Too many requests" }, { status: 429 }), rl);
  let form;
  try {
    form = await req.formData();
  } catch {
    return send(NextResponse.json({ error: "Invalid form data" }, { status: 400 }), rl);
  }

  try {
    const result = await attachProofPhotoByToken({
      token,
      pin: String(form.get("pin") || ""),
      stopId: String(form.get("stopId") || ""),
      file: form.get("file"),
      ipAddress: getClientIp(req),
      userAgent: req.headers.get("user-agent") || "",
    });
    return send(NextResponse.json({ ok: true, ...result }), rl);
  } catch (error) {
    return send(NextResponse.json({ error: error.message || "Unable to upload proof photo." }, { status: 400 }), rl);
  }
}
