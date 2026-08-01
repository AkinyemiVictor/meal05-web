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

test("authenticated cart updates persist through the canonical server cart", () => {
  const cartPage = read("src/app/cart/page.js");
  const cartRoute = read("src/app/api/cart/route.js");
  const cartSync = read("src/lib/cart-sync.js");
  const orderRoute = read("src/app/api/orders/route.js");
  const migration = read("supabase/migrations/20260801101233_canonical_authenticated_cart.sql");

  assert.match(cartPage, /persistCart\(nextItems\)/);
  assert.match(cartPage, /setAuthenticatedCartItem/);
  assert.match(cartPage, /migrateLocalCartToEmptyServer/);
  assert.match(cartPage, /variantId \? null : draft\.id/);
  assert.doesNotMatch(cartRoute, /products\(name, image_url\)/);
  assert.match(cartRoute, /main_image_url/);
  assert.match(cartRoute, /onConflict:\s*"user_id,variant_id"/);
  assert.match(cartSync, /addAuthenticatedCartItem/);
  assert.match(orderRoute, /CART_CHANGED/);
  assert.match(orderRoute, /let cart = \[\]/);
  assert.match(migration, /cart_items_user_variant_unique_idx/);
  assert.match(migration, /cart_items_owner_update/);
  assert.match(migration, /revoke all on table public\.cart_items from anon/);
});
