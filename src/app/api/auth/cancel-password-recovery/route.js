import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/password-recovery";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) => {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
};

const clearRecoveryCookie = (response) => {
  response.cookies.set(PASSWORD_RECOVERY_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
};

export async function POST(request) {
  const rateLimit = await checkRateLimit({
    request,
    id: "auth:cancel-password-recovery:ip",
    limit: 12,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) {
    return applyRateLimitHeaders(json({ error: "Too many attempts. Please try again later." }, 429), rateLimit);
  }

  if (!isTrustedRequestOrigin(request)) {
    return applyRateLimitHeaders(json({ error: "Request origin is not allowed." }, 403), rateLimit);
  }

  const cookieStore = await cookies();
  const supabase = getSupabaseRouteClient(cookieStore);
  const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });

  if (signOutError) {
    return applyRateLimitHeaders(
      json({ error: "We could not close the recovery session safely. Close this tab and try again later." }, 503),
      rateLimit
    );
  }

  return applyRateLimitHeaders(clearRecoveryCookie(json({ ok: true })), rateLimit);
}
