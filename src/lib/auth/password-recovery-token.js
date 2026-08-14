import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { PASSWORD_RECOVERY_MAX_AGE_SECONDS } from "./password-recovery";

const getSigningSecret = () =>
  String(process.env.PASSWORD_RECOVERY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const signatureFor = (payload, secret) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

export const createPasswordRecoveryToken = (userId, now = Date.now()) => {
  const secret = getSigningSecret();
  if (!secret) throw new Error("Password recovery signing secret is not configured.");

  const payload = Buffer.from(
    JSON.stringify({
      userId: String(userId || ""),
      expiresAt: now + PASSWORD_RECOVERY_MAX_AGE_SECONDS * 1000,
    })
  ).toString("base64url");

  return `${payload}.${signatureFor(payload, secret)}`;
};

export const verifyPasswordRecoveryToken = (token, expectedUserId, now = Date.now()) => {
  const secret = getSigningSecret();
  const [payload, providedSignature, ...extra] = String(token || "").split(".");
  if (!secret || !payload || !providedSignature || extra.length) return false;

  const expectedSignature = signatureFor(payload, secret);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return false;

  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return (
      value.userId === String(expectedUserId || "") &&
      Number.isFinite(value.expiresAt) &&
      value.expiresAt >= now
    );
  } catch {
    return false;
  }
};
