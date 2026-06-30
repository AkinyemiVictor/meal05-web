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
  let callbackError = error || "";
  let callbackDescription = desc || "";

  if (code) {
    try {
      const supabase = getSupabaseRouteClient(await cookies());
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        callbackError = "oauth_exchange_failed";
        callbackDescription = exchangeError.message || "Could not complete Google sign-in.";
      }
    } catch (exchangeError) {
      callbackError = "oauth_exchange_failed";
      callbackDescription = exchangeError?.message || "Could not complete Google sign-in.";
    }
  } else if (!callbackError) {
    callbackError = "missing_oauth_code";
    callbackDescription = "Google did not return a valid sign-in code.";
  }

  const target = callbackError
    ? new URL(buildSignInHref({ tab: "login", next: nextPath, hash: "loginForm" }), request.url)
    : new URL("/auth/complete", request.url);
  if (nextPath && !callbackError) {
    target.searchParams.set("next", nextPath);
  }
  if (callbackError && callbackDescription) {
    target.searchParams.set("oauth_error", callbackDescription);
  }
  return NextResponse.redirect(target);
}
