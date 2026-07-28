import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const migration = read("../../../supabase/migrations/20260728140000_phase1_manual_payment_wallet.sql");
const walletFoundationMigration = read("../../../supabase/migrations/20260719120000_meal05_balance_foundation.sql");
const paymentMethodsRoute = read("../../app/api/payment-methods/route.js");
const bankInitRoute = read("../../app/api/payments/bank-transfer/initialize/route.js");
const bankSubmitRoute = read("../../app/api/payments/bank-transfer/submit/route.js");
const walletTopupsRoute = read("../../app/api/wallet/topups/route.js");
const paystackSessionRoute = read("../../app/api/paystack/session/route.js");
const opayRoute = read("../../app/api/payment/opay/route.js");
const opayWebhookRoute = read("../../app/api/payments/opay/webhook/route.js");
const walletPayRoute = read("../../app/api/orders/[orderId]/pay-with-wallet/route.js");
const providerHelper = read("./provider-settings.js");

test("Phase 1 seeds Moniepoint active and recommended", () => {
  assert.match(migration, /'moniepoint_transfer', 'Moniepoint Transfer', 'bank_transfer', true, true, true, true/i);
  assert.match(migration, /payment_provider_one_recommended_transfer_idx/i);
});

test("OPay and Paystack are visible but disabled at launch", () => {
  assert.match(migration, /'opay_transfer', 'OPay Transfer', 'bank_transfer', false, false, false, false/i);
  assert.match(migration, /'paystack', 'Card, USSD and Paystack', 'gateway', false, false, false, false/i);
  assert.match(read("./payment-methods.js"), /case "paystack":\s*return false;/);
  assert.match(read("./payment-methods.js"), /export const isOpayEnabled = \(\) => false;/);
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
  assert.match(migration, /payments_reference_unique_idx/);
  assert.doesNotMatch(providerHelper, /Math\.random/);
});

test("customer transfer submission cannot alter amount or verify payment", () => {
  assert.doesNotMatch(bankSubmitRoute, /parsed\.data\.amount|amount:/);
  assert.match(bankSubmitRoute, /status: "submitted"/);
  assert.doesNotMatch(bankSubmitRoute, /verified_at:\s*|payment_status.*paid|wallet_transactions|status:\s*"verified"/);
});

test("wallet deposits are not spendable until admin verification", () => {
  assert.match(walletTopupsRoute, /status: "awaiting_transfer"/);
  assert.match(walletTopupsRoute, /Wallet deposit awaiting verification|wallet balance will remain unchanged/i);
  assert.doesNotMatch(walletTopupsRoute, /credit_wallet_topup|wallet_transactions/);
});

test("admin verification is idempotent for order payments and wallet topups", () => {
  assert.match(migration, /if v_payment\.status in \('verified', 'success'\)/i);
  assert.match(migration, /already_processed/i);
  assert.match(migration, /where wallet_topup_id = v_topup\.id\s+and type = 'credit'\s+and reason = 'topup'/i);
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
