import "server-only";

import crypto from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const PAYMENT_METHOD_DISABLED = {
  error: "This payment method is currently unavailable.",
  code: "PAYMENT_METHOD_DISABLED",
};

const BANK_TRANSFER_PAYMENT_WINDOW_MINUTES = Number(process.env.BANK_TRANSFER_PAYMENT_WINDOW_MINUTES || 1440);
const WALLET_TOPUP_PAYMENT_WINDOW_MINUTES = Number(process.env.WALLET_TOPUP_PAYMENT_WINDOW_MINUTES || BANK_TRANSFER_PAYMENT_WINDOW_MINUTES);

const text = (value) => String(value ?? "").trim();
const upper = (value) => text(value).toUpperCase();
const bool = (value) => value === true;

export const createPaymentReference = (purpose = "order_payment", now = new Date()) => {
  const prefix = purpose === "wallet_topup" ? "M5-WAL" : "M5-ORD";
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${prefix}-${yy}${mm}${dd}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
};

export const paymentExpiryForPurpose = (purpose = "order_payment") => {
  const minutes = purpose === "wallet_topup" ? WALLET_TOPUP_PAYMENT_WINDOW_MINUTES : BANK_TRANSFER_PAYMENT_WINDOW_MINUTES;
  return new Date(Date.now() + Math.max(15, Number(minutes) || 1440) * 60 * 1000).toISOString();
};

export const isCompleteBankProvider = (provider) =>
  text(provider?.bank_name) && text(provider?.account_name) && text(provider?.account_number);

export const isPaystackServerReady = () =>
  Boolean(text(process.env.PAYSTACK_SECRET_KEY)) && /^pk_(test|live)_/.test(text(process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY));

export const isOpayGatewayServerReady = () =>
  Boolean(
    text(process.env.OPAY_CLIENT_KEY) &&
      text(process.env.OPAY_PUBLIC_KEY) &&
      text(process.env.OPAY_MERCHANT_PRIVATE_KEY) &&
      text(process.env.OPAY_HEAD_MERCHANT_ID) &&
      text(process.env.OPAY_MERCHANT_ID)
  );

export const isProviderUsable = (provider, capability = "checkout") => {
  if (!provider || !bool(provider.is_active)) return false;
  if (["opay_transfer", "opay_gateway"].includes(provider.code)) return false;
  if (capability === "wallet_topup" && !bool(provider.wallet_topup_enabled)) return false;
  if (capability === "checkout" && !bool(provider.checkout_enabled)) return false;
  if (provider.method_type === "bank_transfer") return Boolean(isCompleteBankProvider(provider));
  if (provider.code === "paystack") return isPaystackServerReady();
  if (provider.code === "opay_gateway") return isOpayGatewayServerReady();
  return false;
};

export const sanitizeProvider = (provider, capability = "checkout") => {
  const usable = isProviderUsable(provider, capability);
  const isBankTransfer = provider?.method_type === "bank_transfer";
  return {
    code: provider.code,
    displayName: provider.display_name,
    methodType: provider.method_type,
    isActive: bool(provider.is_active),
    isRecommended: bool(provider.is_recommended),
    checkoutEnabled: bool(provider.checkout_enabled),
    walletTopupEnabled: bool(provider.wallet_topup_enabled),
    displayOrder: Number(provider.display_order || 100),
    logoUrl: provider.logo_url || "",
    customerNotice: provider.customer_notice || "",
    available: usable,
    badge: usable ? (provider.is_recommended ? "Recommended" : "") : provider.code === "paystack" ? "Coming later" : "Unavailable for now",
    bankName: usable && isBankTransfer ? provider.bank_name : "",
    accountName: usable && isBankTransfer ? provider.account_name : "",
    accountNumber: usable && isBankTransfer ? provider.account_number : "",
    accountNumberPreview: usable && isBankTransfer ? maskAccountNumber(provider.account_number) : "",
  };
};

export const maskAccountNumber = (accountNumber) => {
  const value = text(accountNumber);
  if (value.length <= 4) return value;
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
};

export async function loadPaymentProviders(admin = getSupabaseAdminClient()) {
  const { data, error } = await admin
    .from("payment_provider_settings")
    .select("code, display_name, method_type, is_active, is_recommended, checkout_enabled, wallet_topup_enabled, display_order, bank_name, account_name, account_number, logo_url, customer_notice")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function loadPaymentProvider(admin, code) {
  const { data, error } = await admin
    .from("payment_provider_settings")
    .select("code, display_name, method_type, is_active, is_recommended, checkout_enabled, wallet_topup_enabled, display_order, bank_name, account_name, account_number, logo_url, customer_notice")
    .eq("code", text(code))
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function requireUsableProvider(admin, code, capability = "checkout") {
  const provider = await loadPaymentProvider(admin, code);
  if (!isProviderUsable(provider, capability)) {
    const error = new Error(PAYMENT_METHOD_DISABLED.error);
    error.code = PAYMENT_METHOD_DISABLED.code;
    error.status = 503;
    throw error;
  }
  return provider;
}

export const normalizeProviderCode = (value) => {
  const code = text(value).toLowerCase();
  if (code === "bank_transfer" || code === "transfer" || code === "moniepoint") return "moniepoint_transfer";
  if (code === "opay") return "opay_transfer";
  return code;
};

export const normalizeCurrency = (value) => upper(value || "NGN") || "NGN";
