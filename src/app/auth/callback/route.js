import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import getSupabaseRouteClient from "@/lib/supabase/route-client";
import { buildSignInHref, sanitizeReturnPath } from "@/lib/auth-redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const desc = url.searchParams.get("error_description");
  const nextPath = sanitizeReturnPath(url.searchParams.get("next") || "", "");

  try {
    if (code) {
      const supabase = getSupabaseRouteClient(await cookies());
      await supabase.auth.exchangeCodeForSession(code);
    }
  } catch {}

  const target = error
    ? new URL(buildSignInHref({ tab: "login", next: nextPath, hash: "loginForm" }), request.url)
    : new URL("/auth/complete", request.url);
  if (nextPath && !error) {
    target.searchParams.set("next", nextPath);
  }
  if (error && desc) {
    target.searchParams.set("oauth_error", desc);
  }
  return NextResponse.redirect(target);
}
