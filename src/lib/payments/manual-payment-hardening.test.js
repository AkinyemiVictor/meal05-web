import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260826090620_harden_checkout_manual_payments.sql");
const submitRoute = read("src/app/api/payments/bank-transfer/submit/route.js");
const initRoute = read("src/app/api/payments/bank-transfer/initialize/route.js");
const confirmationForm = read("src/components/manual-transfer-confirmation-form.js");

test("financial tables expose SELECT-only ownership policies to browser users", () => {
  assert.match(migration, /revoke all on table public\.orders from anon, authenticated/);
  assert.match(migration, /revoke all on table public\.order_items from anon, authenticated/);
  assert.match(migration, /revoke all on table public\.payments from anon, authenticated/);
  assert.match(migration, /grant select on table public\.orders to authenticated/);
  assert.match(migration, /create policy orders_select_own[\s\S]*for select[\s\S]*auth\.uid/);
  assert.match(migration, /create policy order_items_select_own[\s\S]*for select/);
  assert.match(migration, /create policy payments_select_own[\s\S]*for select/);
  assert.doesNotMatch(migration, /create policy (orders|order_items|payments).*for (all|insert|update|delete)/i);
});

test("manual submission is one locked database transaction and service-role only", () => {
  assert.match(submitRoute, /rpc\("submit_manual_payment"/);
  assert.match(migration, /create or replace function public\.submit_manual_payment/);
  assert.match(migration, /from public\.payments[\s\S]*for update/);
  assert.match(migration, /set status = 'submitted'/);
  assert.match(migration, /set payment_status = 'awaiting_confirmation'/);
  assert.match(migration, /insert into public\.order_status_history/);
  assert.match(migration, /delete from public\.cart_items/);
  assert.match(migration, /revoke all on function public\.submit_manual_payment[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.submit_manual_payment[\s\S]*to service_role/);
});

test("expiry is database-timed, retryable, and preserves timely submissions", () => {
  assert.match(migration, /statement_timestamp\(\)/);
  assert.match(migration, /customer_submitted_at <= v_payment\.expires_at/);
  assert.match(migration, /set status = 'expired'/);
  assert.match(migration, /set payment_status = 'awaiting_payment'/);
  assert.match(migration, /PAYMENT_EXPIRED/);
  assert.match(initRoute, /expireManualPaymentIfNeeded/);
  assert.match(initRoute, /if \(isExpiredPaymentResult\(expiry\)\) payment = null/);
});

test("rejected attempts remain in history and return orders to payment retry", () => {
  assert.match(migration, /set status = 'rejected'/);
  assert.match(migration, /set payment_status = 'awaiting_payment'/);
  assert.doesNotMatch(migration, /set payment_status = 'rejected', status = 'cancelled'/);
});

test("transfer reconciliation form collects real values and explicit exact-amount consent", () => {
  assert.match(confirmationForm, /Name on the account you transferred from/);
  assert.match(confirmationForm, /Bank you transferred from/);
  assert.match(confirmationForm, /Transaction reference \(optional\)/);
  assert.match(confirmationForm, /This helps us locate your transfer faster\./);
  assert.match(confirmationForm, /type="checkbox"/);
  assert.match(confirmationForm, /exactAmountConfirmed/);
  assert.doesNotMatch(submitRoute, /exactAmountConfirmed:\s*true/);
});

test("status checks and security-advisor remediations are explicit", () => {
  assert.match(migration, /orders_status_check/);
  assert.match(migration, /orders_payment_status_check/);
  assert.match(migration, /payments_status_check/);
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /security invoker[\s\S]*public\.is_admin/);
  assert.match(migration, /revoke all on function public\.sync_product_main_image\(\) from public, anon, authenticated/);
});
