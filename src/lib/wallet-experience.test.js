import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("wallet funding is available end to end with readable form spacing", () => {
  const account = read("src/app/account/page.js");
  const css = read("src/app/account/account.module.css");

  assert.match(account, /walletEnabled \? "Available" : "Coming soon"/);
  assert.match(account, /setWalletTopupTransfer\(payload\)/);
  assert.match(account, /Complete your wallet deposit/);
  assert.match(account, /activeTopupProvider\.accountNumber/);
  assert.match(account, /api\/wallet\/topups\/\$\{encodeURIComponent\(topupId\)\}\/submit/);
  assert.match(account, /exactAmountConfirmed:\s*walletExactAmountConfirmed/);
  assert.match(account, /Name on the account you transferred from/);
  assert.match(account, /I transferred exactly/);
  assert.match(account, /walletQuickAmountActive/);
  assert.match(account, /aria-pressed=\{walletTopupAmount === String\(amount\)\}/);
  assert.match(account, /walletFundingControl/);
  assert.match(account, /walletTransferTitle/);
  assert.match(account, /walletPendingItem/);
  assert.match(account, /walletTransactionItem/);
  assert.match(css, /\.walletTopupForm \.profileField input,[\s\S]*?padding:\s*0\.85rem 1rem/);
  assert.match(css, /\.walletTopupForm \.profileField select \{[\s\S]*?padding-right:\s*2\.8rem/);
  assert.match(css, /\.walletBalanceCard,[\s\S]*?\.walletTransactionsSection[\s\S]*?width:\s*min\(100%, 48rem\)/);
  assert.match(css, /\.walletQuickAmounts\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3/);
  assert.match(css, /\.walletBalanceCard \.walletStatusReady,[\s\S]*?display:\s*inline-flex;[\s\S]*?flex:\s*0 0 auto;[\s\S]*?white-space:\s*nowrap/);
});

test("wallet deposits, wallet checkout, and direct checkout remain auditable", () => {
  const account = read("src/app/account/page.js");
  const adminPayments = read("src/app/admin/(secure)/payments/page.js");
  const transferRoute = read("src/app/api/wallet/topups/route.js");
  const walletPaymentRoute = read("src/app/api/orders/[orderId]/pay-with-wallet/route.js");

  assert.match(transferRoute, /purpose:\s*"wallet_topup"/);
  assert.match(transferRoute, /wallet_topup_id:\s*topup\.id/);
  assert.match(walletPaymentRoute, /rpc\("debit_wallet_for_order"/);
  assert.match(account, /Checkout paid with Meal05 Balance/);
  assert.match(account, /Wallet deposit/);
  assert.match(adminPayments, /value === "wallet_topup"\) return "Wallet deposit"/);
  assert.match(adminPayments, /value === "order_payment"\) return "Checkout payment"/);
});
