import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { withNoStore } from "@/lib/api/no-store";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import {
  ensureWalletAccount,
  loadTodaySuccessfulTopupTotal,
  loadWalletSettings,
  normaliseWalletAmount,
  validateTopupAgainstSettings,
} from "@/lib/wallet/server";
import {
  createPaymentReference,
  normalizeProviderCode,
  paymentExpiryForPurpose,
  requireUsableProvider,
  sanitizeProvider,
} from "@/lib/payments/provider-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  amount: z.union([z.string(), z.number()]),
  provider: z.string().trim().max(40).default("moniepoint_transfer"),
});

const send = (body, status, rl) => applyRateLimitHeaders(withNoStore(NextResponse.json(body, { status })), rl);

export async function POST(request) {
  let rl = await checkRateLimit({ request, id: "wallet:topups:create:ip", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return send({ error: "Too many requests" }, 429, rl);

  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return send({ error: "Forbidden origin" }, 403, rl);

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  const user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return send({ error: authErr.message }, 401, rl);
  if (!user) return send({ error: "Not authenticated" }, 401, rl);

  const userRl = await checkRateLimit({ request, id: `wallet:topups:create:user:${user.id}`, limit: 10, windowMs: 60_000 });
  if (!userRl.allowed) return send({ error: "Too many requests" }, 429, userRl);
  rl = userRl;

  let body;
  try {
    body = await request.json();
  } catch {
    return send({ error: "Invalid JSON payload" }, 400, rl);
  }

  const parsed = schema.safeParse(body || {});
  if (!parsed.success) return send({ error: "Validation failed", issues: parsed.error.issues }, 400, rl);

  const providerCode = normalizeProviderCode(parsed.data.provider);
  if (providerCode !== "moniepoint_transfer") {
    return send({ error: "This payment method is currently unavailable.", code: "PAYMENT_METHOD_DISABLED" }, 503, rl);
  }

  let provider;
  try {
    provider = await requireUsableProvider(admin, providerCode, "wallet_topup");
  } catch (error) {
    return send({ error: error.message, code: error.code || "PAYMENT_METHOD_DISABLED" }, error.status || 503, rl);
  }

  const amount = normaliseWalletAmount(parsed.data.amount);
  const { settings, error: settingsError } = await loadWalletSettings(admin);
  if (settingsError) return send({ error: settingsError.message || "Unable to load wallet settings." }, 500, rl);

  const [account, balanceResult, todayTopupTotal] = await Promise.all([
    ensureWalletAccount(admin, user.id, "NGN"),
    admin.rpc("get_wallet_balance", { p_user_id: user.id }),
    loadTodaySuccessfulTopupTotal(admin, user.id),
  ]);
  if (balanceResult.error) return send({ error: balanceResult.error.message || "Unable to load balance." }, 500, rl);
  if (account?.status && account.status !== "active") return send({ error: "Meal05 Wallet is not active." }, 403, rl);

  const validationError = validateTopupAgainstSettings({
    amount,
    provider: providerCode,
    settings,
    currentBalance: Number(balanceResult.data || 0),
    todayTopupTotal,
  });
  if (validationError) return send({ error: validationError }, 403, rl);

  const reference = createPaymentReference("wallet_topup");
  const expiresAt = paymentExpiryForPurpose("wallet_topup");

  const { data: topup, error: topupError } = await admin
    .from("wallet_topups")
    .insert({
      user_id: user.id,
      provider: providerCode,
      amount,
      currency_code: "NGN",
      status: "awaiting_transfer",
      merchant_reference: reference,
      provider_reference: reference,
      metadata: { purpose: "wallet_topup", providerCode },
    })
    .select("id, provider, amount, currency_code, status, merchant_reference, created_at")
    .single();
  if (topupError) return send({ error: topupError.message || "Unable to create wallet deposit." }, 500, rl);

  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .insert({
      user_id: user.id,
      wallet_topup_id: topup.id,
      purpose: "wallet_topup",
      provider_code: providerCode,
      method: providerCode,
      status: "awaiting_transfer",
      amount,
      currency: "NGN",
      currency_code: "NGN",
      reference,
      transaction_ref: reference,
      expires_at: expiresAt,
      metadata: { source: "wallet_topup", topupId: String(topup.id) },
    })
    .select("id, reference, amount, currency, status, purpose, wallet_topup_id, provider_code, expires_at")
    .single();
  if (paymentError) {
    await admin.from("wallet_topups").delete().eq("id", topup.id);
    return send({ error: paymentError.message || "Unable to create deposit payment." }, 500, rl);
  }

  return send(
    {
      topupId: topup.id,
      payment,
      provider: sanitizeProvider(provider, "wallet_topup"),
      heading: "Complete your wallet deposit",
      instruction: "Transfer the exact amount to the account below. Add the Meal05 payment reference to your transfer description where your bank allows it.",
      warning: "Your wallet balance will remain unchanged until Meal05 confirms that the transfer has reached our account.",
    },
    201,
    rl
  );
}
