import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import getSupabaseRouteClient from "@/lib/supabase/route-client";
import { buildSignInHref, sanitizeReturnPath } from "@/lib/auth-redirect";
import {
  isRecentPasswordRecovery,
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_MAX_AGE_SECONDS,
  PASSWORD_RECOVERY_PATH,
} from "@/lib/auth/password-recovery";
import { createPasswordRecoveryToken } from "@/lib/auth/password-recovery-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const desc = url.searchParams.get("error_description");
  const flow = url.searchParams.get("flow");
  const nextPath = sanitizeReturnPath(url.searchParams.get("next") || "", "");
  const isRecoveryFlow = flow === "recovery" && nextPath === PASSWORD_RECOVERY_PATH;
  let callbackError = error || "";
  let callbackDescription = desc || "";
  let recoveryToken = "";

  if (code) {
    try {
      const supabase = getSupabaseRouteClient(await cookies());
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        callbackError = "oauth_exchange_failed";
        callbackDescription = exchangeError.message || "Could not complete sign-in.";
      } else if (isRecoveryFlow && !isRecentPasswordRecovery(data?.user)) {
        callbackError = "invalid_recovery_link";
        callbackDescription = "This password recovery link has expired. Request a new one.";
      } else if (isRecoveryFlow) {
        recoveryToken = createPasswordRecoveryToken(data.user.id);
      }
    } catch (exchangeError) {
      callbackError = "oauth_exchange_failed";
      callbackDescription = exchangeError?.message || "Could not complete Google sign-in.";
    }
  } else if (!callbackError) {
    callbackError = "missing_oauth_code";
    callbackDescription = "The sign-in link did not return a valid code.";
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
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  if (isRecoveryFlow && !callbackError && recoveryToken) {
    response.cookies.set(PASSWORD_RECOVERY_COOKIE, recoveryToken, {
      httpOnly: true,
      maxAge: PASSWORD_RECOVERY_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}
