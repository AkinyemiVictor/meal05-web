import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { checkRateLimit, applyRateLimitHeaders } from "@/lib/api/rate-limit";
import { getOriginTrustContext } from "@/lib/api/request-origin";
import {
  createWalletReference,
  ensureWalletAccount,
  loadTodaySuccessfulTopupTotal,
  loadWalletSettings,
  normaliseWalletAmount,
  normaliseWalletProvider,
  validateTopupAgainstSettings,
} from "@/lib/wallet/server";
import {
  initialisePaystackTransaction,
  resolvePaystackCustomerEmail,
  resolvePaystackSecret,
  toPaystackSubunit,
} from "@/lib/payments/paystack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  amount: z.union([z.string(), z.number()]),
  provider: z.string().trim().max(40).default("paystack"),
  returnUrl: z.string().trim().max(500).optional(),
});

const errorJson = (message, status, rl) =>
  applyRateLimitHeaders(NextResponse.json({ error: message }, { status }), rl);

export async function POST(request) {
  let rl = await checkRateLimit({ request, id: "wallet:topups:create:ip", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return errorJson("Too many requests", 429, rl);

  const admin = getSupabaseAdminClient();
  const originTrust = await getOriginTrustContext(request, admin);
  if (!originTrust.trusted) return errorJson("Forbidden origin", 403, rl);

  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user: cookieUser }, error: authErr } = await auth.auth.getUser();
  const user = originTrust.bearerUser || cookieUser || null;
  if (authErr && !user) return errorJson(authErr.message, 401, rl);
  if (!user) return errorJson("Not authenticated", 401, rl);

  const userRl = await checkRateLimit({ request, id: `wallet:topups:create:user:${user.id}`, limit: 10, windowMs: 60_000 });
  if (!userRl.allowed) return errorJson("Too many requests", 429, userRl);
  rl = userRl;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson("Invalid JSON payload", 400, rl);
  }

  const parsed = schema.safeParse(body || {});
  if (!parsed.success) {
    return applyRateLimitHeaders(NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 }), rl);
  }

  const provider = normaliseWalletProvider(parsed.data.provider);
  const amount = normaliseWalletAmount(parsed.data.amount);
  if (!["paystack", "monnify", "opay"].includes(provider)) return errorJson("Unsupported top-up provider.", 400, rl);

  const { settings, error: settingsError } = await loadWalletSettings(admin);
  if (settingsError) return errorJson(settingsError.message || "Unable to load wallet settings.", 500, rl);

  const [account, balanceResult, todayTopupTotal] = await Promise.all([
    ensureWalletAccount(admin, user.id, "NGN"),
    admin.rpc("get_wallet_balance", { p_user_id: user.id }),
    loadTodaySuccessfulTopupTotal(admin, user.id),
  ]);
  if (balanceResult.error) return errorJson(balanceResult.error.message || "Unable to load balance.", 500, rl);
  if (account?.status && account.status !== "active") return errorJson("Meal05 Balance is not active.", 403, rl);

  const validationError = validateTopupAgainstSettings({
    amount,
    provider,
    settings,
    currentBalance: Number(balanceResult.data || 0),
    todayTopupTotal,
  });
  if (validationError) return errorJson(validationError, 403, rl);

  if (provider !== "paystack") {
    return errorJson(`${provider} Meal05 Balance top-ups are not enabled yet.`, 503, rl);
  }

  const secret = resolvePaystackSecret();
  if (!secret) return errorJson("Paystack top-ups are unavailable.", 503, rl);

  const merchantReference = createWalletReference(provider);
  const email = resolvePaystackCustomerEmail(user);
  const amountKobo = toPaystackSubunit(amount);
  const requestedReturnUrl = String(parsed.data.returnUrl || "").trim();
  const fallbackCallbackUrl = new URL(
    `/api/wallet/topups/callback?reference=${encodeURIComponent(merchantReference)}`,
    request.url
  ).toString();
  const callbackUrl =
    /^meal05:\/\//i.test(requestedReturnUrl) || /^https:\/\/(www\.)?meal05\.com\//i.test(requestedReturnUrl)
      ? requestedReturnUrl
      : fallbackCallbackUrl;

  const { data: topup, error: insertError } = await admin
    .from("wallet_topups")
    .insert({
      user_id: user.id,
      provider,
      amount,
      currency_code: "NGN",
      status: "pending",
      merchant_reference: merchantReference,
      provider_reference: merchantReference,
      metadata: { purpose: "wallet_topup", userId: user.id },
    })
    .select("id, provider, amount, currency_code, merchant_reference")
    .single();
  if (insertError) return errorJson(insertError.message || "Unable to create top-up.", 500, rl);

  let initialized;
  try {
    initialized = await initialisePaystackTransaction({
      secret,
      email,
      amountKobo,
      reference: merchantReference,
      currency: "NGN",
      callbackUrl,
      metadata: {
        purpose: "wallet_topup",
        walletTopupId: String(topup.id),
        userId: String(user.id),
      },
    });
  } catch (error) {
    await admin
      .from("wallet_topups")
      .update({ status: "failed", failure_reason: error?.message || "Unable to initialize Paystack.", updated_at: new Date().toISOString() })
      .eq("id", topup.id);
    return errorJson(error?.message || "Unable to initialize Paystack top-up.", 502, rl);
  }

  await admin
    .from("wallet_topups")
    .update({
      status: "processing",
      authorization_url: initialized.authorization_url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", topup.id);

  return applyRateLimitHeaders(
    NextResponse.json(
      {
        topupId: topup.id,
        provider,
        amount,
        currencyCode: "NGN",
        authorizationUrl: initialized.authorization_url,
        reference: merchantReference,
      },
      { status: 201 }
    ),
    rl
  );
}
