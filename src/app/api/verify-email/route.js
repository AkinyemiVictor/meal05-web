import { NextResponse } from "next/server";
import dns from "dns/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function hasMx(domain) {
  try {
    const mx = await dns.resolveMx(domain);
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const raw = String(body?.email || "").trim().toLowerCase();
    if (!EMAIL_REGEX.test(raw)) {
      return NextResponse.json(
        { ok: false, reason: "invalid_format", message: "Please enter a valid email address." },
        { status: 400 }
      );
    }
    const atIndex = raw.lastIndexOf("@");
    const domain = raw.slice(atIndex + 1);
    if (!domain) {
      return NextResponse.json(
        { ok: false, reason: "invalid_domain", message: "Email domain is invalid." },
        { status: 400 }
      );
    }

    const mxOk = await hasMx(domain);
    if (!mxOk) {
      return NextResponse.json(
        { ok: false, reason: "no_mx", message: "This email domain cannot receive mail." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: "server_error", message: "Unable to verify email right now." },
      { status: 500 }
    );
  }
}

