import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("empty cart keeps chrome and renders a useful state", () => {
  const cartPage = read("src/app/cart/page.js");
  const header = read("src/components/meal05-header.js");
  const mobileNav = read("src/components/mobile-bottom-nav.js");
  const mainCss = read("src/styles/main.css");

  assert.doesNotMatch(mainCss, /body\.cart-is-empty[\s\S]*display:\s*none/i);
  assert.doesNotMatch(header, /useCartHasItems/);
  assert.doesNotMatch(mobileNav, /useCartHasItems/);
  assert.match(cartPage, /empty-cart\.svg/);
  assert.match(cartPage, /Your cart is empty\./);
  assert.match(cartPage, /Start shopping/);
  assert.doesNotMatch(cartPage, />EMPTY CART</);
});

test("cart summary does not show delivery fees or returns copy", () => {
  const cartPage = read("src/app/cart/page.js");

  assert.match(cartPage, /deliveryFee:\s*0/);
  assert.doesNotMatch(cartPage, />Delivery fee</);
  assert.doesNotMatch(cartPage, /Free returns/i);
});

test("cart quantity updates have loading, rollback, and server persistence hooks", () => {
  const cartPage = read("src/app/cart/page.js");

  assert.match(cartPage, /cartUpdateState/);
  assert.match(cartPage, /aria-busy=\{lineBusy\}/);
  assert.match(cartPage, /fetch\(`\/api\/cart\/\$\{encodeURIComponent\(cartItemId\)\}`/);
  assert.match(cartPage, /setCartItems\(previousItems\)/);
  assert.match(cartPage, /Unable to update cart quantity/);
});

test("payment status modal is a fixed body portal with dialog accessibility", () => {
  const checkoutForm = read("src/components/checkout-form.js");
  const checkoutCss = read("src/styles/checkout.css");

  assert.match(checkoutForm, /createPortal/);
  assert.match(checkoutForm, /role="alertdialog"/);
  assert.match(checkoutForm, /aria-modal="true"/);
  assert.match(checkoutForm, /document\.body\.style\.overflow = "hidden"/);
  assert.match(checkoutForm, /event\.key === "Escape"/);
  assert.match(checkoutCss, /\.checkout-status-overlay\s*\{[\s\S]*position:\s*fixed/);
  assert.match(checkoutCss, /z-index:\s*10000/);
});

test("wallet and quantity errors use flow-specific messages", () => {
  const checkoutForm = read("src/components/checkout-form.js");
  const orderRoute = read("src/app/api/orders/route.js");
  const walletRoute = read("src/app/api/orders/[orderId]/pay-with-wallet/route.js");

  assert.match(checkoutForm, /Payment unsuccessful\. Insufficient wallet balance\./);
  assert.match(checkoutForm, /Adjust cart quantity before continuing to payment\./);
  assert.match(checkoutForm, /product option/);
  assert.match(orderRoute, /Payment unsuccessful\. Insufficient wallet balance\./);
  assert.match(orderRoute, /Adjust cart quantity/);
  assert.match(walletRoute, /Payment successful\. Your Meal05 Wallet has been charged\./);
  assert.doesNotMatch(checkoutForm, /Maximum is 10/);
});

test("checkout routes directly to Moniepoint with copy icons and pending confirmation UI", () => {
  const checkoutForm = read("src/components/checkout-form.js");
  const paymentPage = read("src/app/checkout/payment/page.js");
  const providerPage = read("src/app/checkout/payment/[providerCode]/page.js");

  assert.match(checkoutForm, /router\.push\("\/checkout\/payment\/moniepoint_transfer"\)/);
  assert.match(paymentPage, /redirect\("\/checkout\/payment\/moniepoint_transfer"\)/);
  assert.doesNotMatch(paymentPage, /OPay|radiogroup|Choose payment method/);
  assert.match(providerPage, /available:\s*false/);
  assert.match(providerPage, /aria-label="Copy payment amount"/);
  assert.match(providerPage, /copyToClipboard/);
  assert.match(providerPage, /fa-regular fa-copy/);
  assert.doesNotMatch(providerPage, /copied \? "fa-solid fa-check"/);
  assert.match(providerPage, /We are confirming your payment\. You will receive a notification upon confirmation\./);
  assert.match(providerPage, /IconMoodSmile/);
  assert.match(providerPage, /IconBuildingBank/);
  assert.match(providerPage, /role="alertdialog"/);
  assert.match(providerPage, />\s*Secured\s*</);
  assert.doesNotMatch(providerPage, /OPay|Sterling|Before you make this transfer/);
});

test("bank transfer acknowledgement and OPay webhook fail closed", () => {
  const submitRoute = read("src/app/api/payments/bank-transfer/submit/route.js");
  const opayWebhook = read("src/app/api/payments/opay/webhook/route.js");
  const migration = read("supabase/migrations/20260730111500_activate_opay_transfer_when_configured.sql");

  assert.match(submitRoute, /Please confirm that you will transfer the exact amount\./);
  assert.match(opayWebhook, /createHmac\("sha3-512"/);
  assert.match(opayWebhook, /buildOpayCallbackSignaturePayload/);
  assert.match(opayWebhook, /Payment update count mismatch/);
  assert.match(opayWebhook, /The verified currency does not match this order\./);
  assert.match(opayWebhook, /The verified amount does not match this order\./);
  assert.match(migration, /where code = 'opay_transfer'/);
  assert.match(migration, /coalesce\(account_number/);
});

test("authenticated cart additions merge matching variants and checkout retries reuse one order key", () => {
  const cartRoute = read("src/app/api/cart/route.js");
  const cartMigration = read("supabase/migrations/20260801101233_canonical_authenticated_cart.sql");
  const checkoutForm = read("src/components/checkout-form.js");
  const providerPage = read("src/app/checkout/payment/[providerCode]/page.js");

  assert.match(cartRoute, /\.eq\("variant_id", variantKey\)/);
  assert.match(cartRoute, /onConflict:\s*"user_id,variant_id"/);
  assert.match(cartMigration, /sum\(quantity\)/);
  assert.match(cartMigration, /unique index cart_items_user_variant_unique_idx/);
  assert.match(checkoutForm, /orderIdempotencyKey:\s*createCheckoutIdempotencyKey\(\)/);
  assert.match(providerPage, /pending\.orderIdempotencyKey \|\| createIdempotencyKey/);
});

test("wallet checkout is atomically idempotent and submitted transfers clear the cart pending verification", () => {
  const orderRoute = read("src/app/api/orders/route.js");
  const walletMigration = read("supabase/migrations/20260719120000_meal05_balance_foundation.sql");
  const transferRoute = read("src/app/api/payments/bank-transfer/initialize/route.js");
  const transferSubmitRoute = read("src/app/api/payments/bank-transfer/submit/route.js");

  assert.match(orderRoute, /rpc\("debit_wallet_for_order"/);
  assert.match(orderRoute, /p_idempotency_key:\s*walletPaymentKey/);
  assert.match(orderRoute, /requestedPaymentMethod === "wallet"[\s\S]*from\("cart_items"\)\.delete/);
  assert.match(walletMigration, /create or replace function public\.debit_wallet_for_order/);
  assert.match(walletMigration, /insufficient.*balance/i);
  assert.match(transferRoute, /\.eq\("order_id", order\.id\)/);
  assert.match(transferRoute, /if \(!payment\)/);
  assert.match(transferSubmitRoute, /payment\.purpose === "order_payment"[\s\S]*from\("cart_items"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("user_id", auth\.user\.id\)/);
  assert.match(orderRoute, /status:\s*"pending"[\s\S]*payment_status:\s*"pending"/);
});
