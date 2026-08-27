import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const providerSettingsMigration = read("../../../supabase/migrations/20260728151918_payment_provider_settings.sql");
const paymentRepairMigration = read("../../../supabase/migrations/20260728175222_repair_stock_and_phase1_payments.sql");
const lifecycleMigration = read("../../../supabase/migrations/20260826090620_harden_checkout_manual_payments.sql");
const walletFoundationMigration = read("../../../supabase/migrations/20260719173638_meal05_balance_foundation.sql");
const paymentMethodsRoute = read("../../app/api/payment-methods/route.js");
const bankInitRoute = read("../../app/api/payments/bank-transfer/initialize/route.js");
const bankSubmitRoute = read("../../app/api/payments/bank-transfer/submit/route.js");
const walletTopupsRoute = read("../../app/api/wallet/topups/route.js");
const paystackSessionRoute = read("../../app/api/paystack/session/route.js");
const opayRoute = read("../../app/api/payment/opay/route.js");
const opayWebhookRoute = read("../../app/api/payments/opay/webhook/route.js");
const walletPayRoute = read("../../app/api/orders/[orderId]/pay-with-wallet/route.js");
const providerHelper = read("./provider-settings.js");

test("Phase 1 seeds Moniepoint first while provider activation remains fail-closed", () => {
  assert.match(providerSettingsMigration, /\(\s*'moniepoint_transfer',\s*'Moniepoint Transfer',\s*'bank_transfer',\s*false,\s*false,\s*false,\s*false,\s*1,/i);
  assert.match(providerSettingsMigration, /payment_provider_settings_one_recommended_transfer_uidx/i);
});

test("OPay and Paystack stay disabled while Moniepoint is the only transfer option", () => {
  assert.match(providerSettingsMigration, /\(\s*'opay_transfer',\s*'OPay Transfer',\s*'bank_transfer',\s*false,\s*false,\s*false,\s*false,/i);
  assert.match(providerSettingsMigration, /\(\s*'paystack',\s*'Card, USSD and Paystack',\s*'gateway',\s*false,\s*false,\s*false,\s*false,/i);
  assert.match(read("./payment-methods.js"), /case "paystack":\s*return false;/);
  assert.match(read("./payment-methods.js"), /export const isOpayEnabled = \(\) => false;/);
  assert.match(read("./payment-methods.js"), /case "opay_transfer":\s*return isOpayEnabled\(\);/);
  assert.match(providerHelper, /\["opay_transfer", "opay_gateway"\]\.includes\(provider\.code\)/);
});

test("disabled Paystack and OPay initialization are rejected server-side", () => {
  assert.match(paystackSessionRoute, /requireUsableProvider\(admin, "paystack", "checkout"\)/);
  assert.match(paystackSessionRoute, /PAYMENT_METHOD_DISABLED/);
  assert.match(opayRoute, /PAYMENT_METHOD_DISABLED/);
  assert.match(opayWebhookRoute, /disabled_provider_rejected/);
});

test("public provider API returns sanitized display data only", () => {
  assert.match(paymentMethodsRoute, /sanitizeProvider/);
  assert.doesNotMatch(paymentMethodsRoute, /PAYSTACK_SECRET_KEY|OPAY_MERCHANT_PRIVATE_KEY|service_role/i);
  assert.match(providerHelper, /accountNumberPreview/);
  assert.match(providerHelper, /bankName: usable/);
});

test("manual bank-transfer references are server-generated and unique", () => {
  assert.match(providerHelper, /crypto\.randomBytes\(4\)/);
  assert.match(providerHelper, /M5-ORD/);
  assert.match(providerHelper, /M5-WAL/);
  assert.match(paymentRepairMigration, /payments_reference_unique_idx/);
  assert.doesNotMatch(providerHelper, /Math\.random/);
});

test("customer transfer submission cannot alter amount or verify payment", () => {
  assert.doesNotMatch(bankSubmitRoute, /parsed\.data\.amount|amount:/);
  assert.match(bankSubmitRoute, /rpc\("submit_manual_payment"/);
  assert.doesNotMatch(bankSubmitRoute, /verified_at:\s*|payment_status.*paid|wallet_transactions|status:\s*"verified"/);
  assert.match(lifecycleMigration, /set payment_status = 'awaiting_confirmation'/);
  assert.match(lifecycleMigration, /delete from public\.cart_items where user_id = p_user_id/);
});

test("manual transfer confirmation and rejection move payment and fulfilment independently", () => {
  assert.match(lifecycleMigration, /payment_status = 'paid'[\s\S]*status = 'processing'/);
  assert.match(lifecycleMigration, /status = 'rejected'[\s\S]*payment_status = 'awaiting_payment'/);
  assert.match(lifecycleMigration, /Payment confirmed by administrator/);
  assert.match(lifecycleMigration, /order returned to awaiting payment/);
});

test("wallet deposits are not spendable until admin verification", () => {
  assert.match(walletTopupsRoute, /status: "awaiting_transfer"/);
  assert.match(walletTopupsRoute, /Wallet deposit awaiting verification|wallet balance will remain unchanged/i);
  assert.doesNotMatch(walletTopupsRoute, /credit_wallet_topup|wallet_transactions/);
});

test("admin verification is idempotent for order payments and wallet topups", () => {
  assert.match(lifecycleMigration, /in \('verified', 'success', 'successful'\)/i);
  assert.match(lifecycleMigration, /already_processed/i);
  assert.match(lifecycleMigration, /public\.credit_wallet_topup/);
});

test("wallet payment route uses atomic RPC and idempotency", () => {
  assert.match(walletPayRoute, /debit_wallet_for_order/);
  assert.match(walletPayRoute, /Idempotency-Key|x-idempotency-key/);
  assert.match(walletFoundationMigration, /if v_balance < v_order\.total then\s+raise exception 'Insufficient Meal05 Balance'/i);
  assert.match(walletFoundationMigration, /where user_id = p_user_id\s+and idempotency_key = v_idempotency/i);
});

test("payment and wallet APIs use no-store responses", () => {
  [
    paymentMethodsRoute,
    bankInitRoute,
    bankSubmitRoute,
    walletTopupsRoute,
    paystackSessionRoute,
    opayRoute,
    walletPayRoute,
  ].forEach((source) => {
    assert.match(source, /no-store|withNoStore/);
  });
});
