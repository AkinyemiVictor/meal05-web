import "server-only";
import crypto from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const WALLET_DISCLOSURE =
  "Meal05 Balance can only be used for purchases on Meal05. It is not a bank account and does not earn interest.";

export const normaliseWalletProvider = (value) => String(value || "").trim().toLowerCase();

export const normaliseWalletAmount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100) / 100;
};

export const createWalletReference = (provider = "paystack") => {
  const stamp = Date.now();
  const nonce = crypto.randomBytes(8).toString("hex");
  return `MB-${String(provider).toUpperCase()}-${stamp}-${nonce}`;
};

export const defaultWalletSettings = {
  walletEnabled: false,
  paystackTopupsEnabled: false,
  monnifyTopupsEnabled: false,
  opayTopupsEnabled: false,
  walletPaymentEnabled: false,
  walletRefundsEnabled: false,
  mixedPaymentEnabled: false,
  minimumTopupAmount: null,
  maximumTopupAmount: null,
  dailyTopupLimit: null,
  maximumWalletBalance: null,
};

const mapSettings = (row) => ({
  walletEnabled: row?.wallet_enabled === true,
  paystackTopupsEnabled: row?.paystack_topups_enabled === true,
  monnifyTopupsEnabled: row?.monnify_topups_enabled === true,
  opayTopupsEnabled: row?.opay_topups_enabled === true,
  walletPaymentEnabled: row?.wallet_payment_enabled === true,
  walletRefundsEnabled: row?.wallet_refunds_enabled === true,
  mixedPaymentEnabled: row?.mixed_payment_enabled === true,
  minimumTopupAmount: row?.minimum_topup_amount == null ? null : Number(row.minimum_topup_amount),
  maximumTopupAmount: row?.maximum_topup_amount == null ? null : Number(row.maximum_topup_amount),
  dailyTopupLimit: row?.daily_topup_limit == null ? null : Number(row.daily_topup_limit),
  maximumWalletBalance: row?.maximum_wallet_balance == null ? null : Number(row.maximum_wallet_balance),
});

export const loadWalletSettings = async (admin = getSupabaseAdminClient()) => {
  const { data, error } = await admin.from("wallet_settings").select("*").eq("id", true).maybeSingle();
  if (error) {
    return { settings: defaultWalletSettings, error };
  }
  return { settings: mapSettings(data), error: null };
};

export const ensureWalletAccount = async (admin, userId, currencyCode = "NGN") => {
  const { data, error } = await admin.rpc("ensure_wallet_account", {
    p_user_id: userId,
    p_currency_code: currencyCode,
  });
  if (error) throw error;
  return data;
};

export const loadWalletSnapshot = async (admin, userId) => {
  await ensureWalletAccount(admin, userId, "NGN");
  const [settingsResult, accountResult, balanceResult, pendingTopupsResult] = await Promise.all([
    loadWalletSettings(admin),
    admin.from("wallet_accounts").select("user_id, currency_code, status, created_at, updated_at").eq("user_id", userId).maybeSingle(),
    admin.rpc("get_wallet_balance", { p_user_id: userId }),
    admin
      .from("wallet_topups")
      .select("id, provider, amount, currency_code, status, merchant_reference, provider_reference, authorization_url, failure_reason, created_at, updated_at")
      .eq("user_id", userId)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (accountResult.error) throw accountResult.error;
  if (balanceResult.error) throw balanceResult.error;
  if (pendingTopupsResult.error) throw pendingTopupsResult.error;

  return {
    account: accountResult.data,
    balance: Number(balanceResult.data || 0),
    currencyCode: accountResult.data?.currency_code || "NGN",
    disclosure: WALLET_DISCLOSURE,
    settings: settingsResult.settings,
    pendingTopups: pendingTopupsResult.data || [],
  };
};

export const isProviderTopupEnabled = (settings, provider) => {
  switch (normaliseWalletProvider(provider)) {
    case "paystack":
      return settings.walletEnabled && settings.paystackTopupsEnabled;
    case "monnify":
      return settings.walletEnabled && settings.monnifyTopupsEnabled;
    case "opay":
      return settings.walletEnabled && settings.opayTopupsEnabled;
    default:
      return false;
  }
};

export const validateTopupAgainstSettings = ({ amount, provider, settings, currentBalance = 0, todayTopupTotal = 0 }) => {
  if (!settings.walletEnabled) return "Meal05 Balance is not enabled yet.";
  if (!isProviderTopupEnabled(settings, provider)) return "This top-up provider is not enabled yet.";
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "Enter a valid top-up amount.";
  if (settings.minimumTopupAmount == null || settings.maximumTopupAmount == null) {
    return "Meal05 Balance top-up limits have not been configured yet.";
  }
  if (amount < settings.minimumTopupAmount) return `Minimum top-up amount is ${settings.minimumTopupAmount}.`;
  if (amount > settings.maximumTopupAmount) return `Maximum top-up amount is ${settings.maximumTopupAmount}.`;
  if (settings.dailyTopupLimit != null && todayTopupTotal + amount > settings.dailyTopupLimit) {
    return "This top-up exceeds your daily Meal05 Balance limit.";
  }
  if (settings.maximumWalletBalance != null && currentBalance + amount > settings.maximumWalletBalance) {
    return "This top-up would exceed the maximum Meal05 Balance limit.";
  }
  return "";
};

export const loadTodaySuccessfulTopupTotal = async (admin, userId) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await admin
    .from("wallet_topups")
    .select("amount")
    .eq("user_id", userId)
    .eq("status", "successful")
    .gte("paid_at", start.toISOString());
  if (error) throw error;
  return (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
};
