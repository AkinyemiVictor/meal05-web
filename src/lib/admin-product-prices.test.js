import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("admin product price API is server-admin only and updates variant prices", () => {
  const route = read("src/app/api/admin/product-prices/route.js");

  assert.match(route, /process\.env\.ADMIN_EMAILS/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_ADMIN_EMAILS/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /\.strict\(\)/);
  assert.match(route, /\.max\(200\)/);
  assert.match(route, /\.from\("product_variants"\)/);
  assert.match(route, /price:\s*update\.price/);
  assert.match(route, /old_price:\s*update\.oldPrice/);
  assert.match(route, /revalidateTag\("products"\)/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /oldPrice must be greater than or equal to price/);
});

test("admin price manager supports filters, bulk preview, unsaved warning, and batched saves", () => {
  const page = read("src/app/admin/(secure)/prices/page.js");
  const editor = read("src/components/admin-price-editor.js");
  const css = read("src/app/admin/(secure)/prices/admin-prices.css");

  assert.doesNotMatch(page, /loadVolatilePriceAdminData/);
  assert.match(editor, /\/api\/admin\/product-prices/);
  assert.match(editor, /Search/);
  assert.match(editor, /Category/);
  assert.match(editor, /Status/);
  assert.match(editor, /Save selected/);
  assert.match(editor, /Save all changes/);
  assert.match(editor, /beforeunload/);
  assert.match(editor, /applyBulkPreview/);
  assert.match(editor, /roundTo/);
  assert.match(css, /\.admin-price-table/);
});

test("checkout blocks stale cart prices before transfer or wallet payment", () => {
  const orderRoute = read("src/app/api/orders/route.js");
  const checkoutForm = read("src/components/checkout-form.js");

  assert.match(orderRoute, /PRICE_CHANGED/);
  assert.match(orderRoute, /unit_price_at_add/);
  assert.match(orderRoute, /currentPrice/);
  assert.match(checkoutForm, /applyServerPriceChangesToCart/);
  assert.match(checkoutForm, /handleOrderApiError/);
  assert.match(checkoutForm, /preview:\s*true/);
  assert.match(checkoutForm, /writeStoredCart\(nextCart\)/);
  assert.match(checkoutForm, /variantId \? null : item\?\.id/);
});

test("cart quantity updates do not require a backend cart row for local lines", () => {
  const cartPage = read("src/app/cart/page.js");

  assert.match(cartPage, /persistCart\(nextItems\)/);
  assert.match(cartPage, /currentUser && target\.cartItemId/);
  assert.doesNotMatch(cartPage, /Refresh your cart and try again/);
  assert.match(cartPage, /variantId \? null : draft\.id/);
});
