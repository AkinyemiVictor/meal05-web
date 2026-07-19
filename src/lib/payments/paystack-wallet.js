import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { normaliseText, verifyPaystackTransaction } from "@/lib/payments/paystack";

const normaliseEmail = (value) => normaliseText(value).toLowerCase();

const amountMatchesTopup = (amountKobo, topupAmount) => {
  const actual = Number(amountKobo);
  const expected = Math.round((Number(topupAmount) || 0) * 100);
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= 1;
};

const loadUserEmail = async (admin, userId) => {
  try {
    const { data, error } = await admin.auth.admin.getUserById(String(userId || ""));
    if (error) return "";
    return normaliseEmail(data?.user?.email);
  } catch {
    return "";
  }
};

export const applyVerifiedPaystackWalletTopup = async ({ reference, topupId, userId }) => {
  const normalizedReference = normaliseText(reference);
  const normalizedTopupId = normaliseText(topupId);
  if (!normalizedReference && !normalizedTopupId) {
    return { ok: false, status: 400, error: "Missing top-up reference", verified: false };
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return { ok: false, status: 500, error: "PAYSTACK_SECRET_KEY is not set", verified: false };
  }

  const admin = getSupabaseAdminClient();
  let query = admin
    .from("wallet_topups")
    .select("id, user_id, provider, amount, currency_code, status, merchant_reference, provider_reference");
  query = normalizedTopupId ? query.eq("id", normalizedTopupId) : query.eq("merchant_reference", normalizedReference);
  const { data: topup, error: topupError } = await query.maybeSingle();
  if (topupError) return { ok: false, status: 500, error: topupError.message || "Unable to load top-up", verified: false };
  if (!topup) return { ok: false, status: 404, error: "Top-up not found", verified: false };

  if (userId && String(topup.user_id) !== String(userId)) {
    return { ok: false, status: 403, error: "Forbidden", verified: false };
  }
  if (topup.provider !== "paystack") {
    return { ok: false, status: 409, error: "Top-up provider mismatch", verified: false };
  }

  const referenceToVerify = normalizedReference || normaliseText(topup.provider_reference || topup.merchant_reference);
  const verified = await verifyPaystackTransaction(referenceToVerify, secret);
  if (!verified.ok) {
    await admin
      .from("wallet_topups")
      .update({ status: "failed", failure_reason: verified.error || "Verification failed", updated_at: new Date().toISOString() })
      .eq("id", topup.id)
      .neq("status", "successful");
    return { ok: false, status: 400, error: verified.error || "Verification failed", verified: false };
  }

  const tx = verified.tx || {};
  const txReference = normaliseText(tx.reference || referenceToVerify);
  if (txReference !== normaliseText(topup.provider_reference || topup.merchant_reference)) {
    return { ok: false, status: 409, error: "Top-up reference mismatch", verified: false };
  }
  if (normaliseText(tx?.metadata?.purpose) !== "wallet_topup") {
    return { ok: false, status: 409, error: "Payment purpose mismatch", verified: false };
  }
  if (normaliseText(tx?.metadata?.walletTopupId) && normaliseText(tx.metadata.walletTopupId) !== String(topup.id)) {
    return { ok: false, status: 409, error: "Payment top-up mismatch", verified: false };
  }
  if (normaliseText(tx?.metadata?.userId) && normaliseText(tx.metadata.userId) !== String(topup.user_id)) {
    return { ok: false, status: 409, error: "Payment customer mismatch", verified: false };
  }
  if (!amountMatchesTopup(tx.amount, topup.amount)) {
    return { ok: false, status: 409, error: "Payment amount does not match top-up amount", verified: false };
  }
  const currencyCode = normaliseText(tx.currency || "NGN").toUpperCase();
  if (currencyCode !== normaliseText(topup.currency_code || "NGN").toUpperCase()) {
    return { ok: false, status: 409, error: "Payment currency does not match top-up currency", verified: false };
  }
  const ownerEmail = await loadUserEmail(admin, topup.user_id);
  const payerEmail = normaliseEmail(tx?.customer?.email);
  if (ownerEmail && payerEmail && ownerEmail !== payerEmail) {
    return { ok: false, status: 409, error: "Payment email does not match account owner", verified: false };
  }

  const { data: creditResult, error: creditError } = await admin.rpc("credit_wallet_topup", {
    p_topup_id: topup.id,
    p_provider_reference: txReference,
    p_idempotency_key: `paystack-wallet-topup:${txReference}`,
  });
  if (creditError) {
    return { ok: false, status: 500, error: creditError.message || "Unable to credit Meal05 Balance", verified: true };
  }

  return {
    ok: true,
    status: 200,
    body: {
      verified: true,
      topupId: topup.id,
      provider: "paystack",
      reference: txReference,
      amount: Number(topup.amount) || 0,
      currency: currencyCode,
      alreadyProcessed: creditResult?.already_processed === true,
      balance: Number(creditResult?.balance || 0),
    },
  };
};
