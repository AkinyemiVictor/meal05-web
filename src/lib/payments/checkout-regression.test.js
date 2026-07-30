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

test("transfer pages use server-controlled availability and exact amount copy UI", () => {
  const paymentPage = read("src/app/checkout/payment/page.js");
  const providerPage = read("src/app/checkout/payment/[providerCode]/page.js");

  assert.match(paymentPage, /available:\s*false/);
  assert.match(paymentPage, /role="radiogroup"/);
  assert.match(paymentPage, /Choose payment method/);
  assert.doesNotMatch(paymentPage, /method\.description/);
  assert.match(providerPage, /available:\s*false/);
  assert.match(providerPage, /aria-label="Copy payment amount"/);
  assert.match(providerPage, /copyToClipboard/);
  assert.match(providerPage, />\s*Secured\s*</);
  assert.doesNotMatch(providerPage, /Secured by Meal05/);
  assert.doesNotMatch(providerPage, /Copy amount <i/);
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
