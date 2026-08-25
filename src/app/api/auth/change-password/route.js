import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { applyRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { isTrustedRequestOrigin } from "@/lib/api/request-origin";
import {
  PASSWORD_RECOVERY_COOKIE,
} from "@/lib/auth/password-recovery";
import { verifyPasswordRecoveryToken } from "@/lib/auth/password-recovery-token";
import { getPasswordValidationMessage, isStrongPassword } from "@/lib/password-policy";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const passwordSchema = z
  .object({
    currentPassword: z.string().max(256).optional().default(""),
    newPassword: z.string().min(1).max(256),
    confirmPassword: z.string().min(1).max(256),
    recovery: z.boolean().optional().default(false),
    signOutOthers: z.boolean().optional().default(true),
  })
  .superRefine((value, context) => {
    if (!value.recovery && !value.currentPassword) {
      context.addIssue({
        code: "custom",
        path: ["currentPassword"],
        message: "Enter your current password.",
      });
    }
    if (!isStrongPassword(value.newPassword)) {
      context.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: getPasswordValidationMessage(value.newPassword),
      });
    }
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "The new passwords do not match.",
      });
    }
    if (!value.recovery && value.currentPassword && value.currentPassword === value.newPassword) {
      context.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "Choose a password that is different from your current password.",
      });
    }
  });

const json = (body, status = 200) => {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
};

const withRateLimit = (response, rateLimit) => applyRateLimitHeaders(response, rateLimit);

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

const finishRecoverySession = async ({ supabase, signOutOthers }) => {
  if (!signOutOthers) {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    return { error, warning: "" };
  }

  const { error: globalSignOutError } = await supabase.auth.signOut({ scope: "global" });
  if (!globalSignOutError) {
    return { error: null, warning: "" };
  }

  const { error: localSignOutError } = await supabase.auth.signOut({ scope: "local" });
  if (localSignOutError) {
    return { error: localSignOutError, warning: "" };
  }

  return {
    error: null,
    warning: "Password changed, but some other signed-in devices may remain active.",
  };
};

export async function POST(request) {
  let rateLimit = await checkRateLimit({
    request,
    id: "auth:change-password:ip",
    limit: 8,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) {
    return withRateLimit(json({ error: "Too many attempts. Please try again later." }, 429), rateLimit);
  }

  if (!isTrustedRequestOrigin(request)) {
    return withRateLimit(json({ error: "Request origin is not allowed." }, 403), rateLimit);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return withRateLimit(json({ error: "Invalid request." }, 400), rateLimit);
  }

  const parsed = passwordSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Check the password details and try again.";
    return withRateLimit(json({ error: message }, 400), rateLimit);
  }

  const cookieStore = await cookies();
  const supabase = getSupabaseRouteClient(cookieStore);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return withRateLimit(json({ error: "Your session has expired. Please sign in again." }, 401), rateLimit);
  }

  rateLimit = await checkRateLimit({
    request,
    id: `auth:change-password:user:${user.id}`,
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) {
    return withRateLimit(json({ error: "Too many attempts. Please try again later." }, 429), rateLimit);
  }

  const { currentPassword, newPassword, recovery, signOutOthers } = parsed.data;
  const recoveryToken = cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value || "";
  const recoveryAuthorized = verifyPasswordRecoveryToken(recoveryToken, user.id);

  if (recovery && !recoveryAuthorized) {
    return withRateLimit(
      clearRecoveryCookie(json({ error: "This recovery link has expired. Request a new one." }, 403)),
      rateLimit
    );
  }

  if (!recovery) {
    if (!user.email) {
      return withRateLimit(
        json({ error: "This account has no email password to verify. Use password recovery instead." }, 409),
        rateLimit
      );
    }

    const { error: verificationError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verificationError) {
      return withRateLimit(json({ error: "Current password is incorrect." }, 400), rateLimit);
    }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return withRateLimit(
      json({ error: updateError.message || "We could not update your password. Please try again." }, 400),
      rateLimit
    );
  }

  if (recovery) {
    const { error: recoverySignOutError, warning } = await finishRecoverySession({ supabase, signOutOthers });
    if (recoverySignOutError) {
      return withRateLimit(
        json({
          error: "Your password changed, but the recovery session could not be closed safely. Close this tab and try signing in again after the recovery window expires.",
          passwordUpdated: true,
        }, 503),
        rateLimit
      );
    }

    return withRateLimit(
      clearRecoveryCookie(json({ ok: true, recoveryComplete: true, ...(warning ? { warning } : {}) })),
      rateLimit
    );
  }

  if (signOutOthers) {
    const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
    if (signOutError) {
      const response = clearRecoveryCookie(
        json({
          ok: true,
          warning: "Password changed, but some other signed-in devices may remain active.",
        })
      );
      return withRateLimit(response, rateLimit);
    }
  }

  return withRateLimit(clearRecoveryCookie(json({ ok: true })), rateLimit);
}
