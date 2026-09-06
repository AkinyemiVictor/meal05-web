import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const accountPage = read("src/app/account/page.js");
const accountStyles = read("src/app/account/account.module.css");
const ordersRoute = read("src/app/api/orders/route.js");

test("customer order history sends the verified browser session to the API", () => {
  assert.match(accountPage, /supabase\.auth\.getSession\(\)/);
  assert.match(accountPage, /Authorization: `Bearer \$\{accessToken\}`/);
});

test("customer order reads stay scoped to the verified user without a second cookie handoff", () => {
  assert.match(ordersRoute, /getVerifiedBearerUser\(request, admin\)/);
  assert.match(ordersRoute, /const user = bearerUser \|\| cookieUser \|\| null/);
  assert.match(
    ordersRoute,
    /const result = await admin[\s\S]*?\.from\("orders"\)[\s\S]*?\.eq\("user_id", user\.id\)/
  );
});

test("customer order items do not depend on an undeclared product relationship", () => {
  assert.doesNotMatch(ordersRoute, /order_items:order_items\([^\n"]*products\(/);
  assert.match(ordersRoute, /admin\.from\("products"\)\.select\("id, name, main_image_url"\)/);
  assert.match(ordersRoute, /admin\.from\("product_variants"\)\.select\("id, name, display_label, size, unit"\)/);
  assert.match(ordersRoute, /productsById\.get\(String\(it\?\.product_id\)\)/);
  assert.match(ordersRoute, /variantsById\.get\(String\(it\?\.variant_id\)\)/);
});

test("checkout snapshots readable order-line details and history renders them", () => {
  assert.match(ordersRoute, /product_name: resolveProductName\(c\)/);
  assert.match(ordersRoute, /variant_name: resolveVariantName\(c\)/);
  assert.match(ordersRoute, /unit: resolveUnit\(c\)/);
  assert.match(ordersRoute, /image_url: resolveProductMeta\(c\)\?\.imageUrl/);
  assert.match(ordersRoute, /order_items:order_items\(order_id, product_id, variant_id, product_name, variant_name, unit, image_url/);
  assert.match(accountPage, /function OrderItemsList/);
  assert.match(accountPage, /<Image src=\{image\}/);
  assert.match(accountPage, /Items ordered/);
  assert.match(accountPage, /Option: \{option\}/);
  assert.match(accountPage, /Quantity: \{quantity\}/);
});

test("customer order item layout reflows without a wide table", () => {
  assert.match(accountStyles, /\.orderItemsList li\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(accountStyles, /@media \(max-width: 720px\)[\s\S]*?\.orderItemsList li\s*\{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(accountStyles, /overflow-wrap: anywhere/);
  assert.match(accountStyles, /\.orderItemProduct\s*\{[\s\S]*?grid-template-columns: 3\.5rem minmax\(0, 1fr\)/);
  assert.match(accountStyles, /@media \(max-width: 420px\)[\s\S]*?\.layout\s*\{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(accountStyles, /@media \(max-width: 420px\)[\s\S]*?\.orderItemPrice\s*\{[\s\S]*?grid-template-columns: 1fr/);
});

test("customer order failures are visible instead of rendering a false empty history", () => {
  assert.match(accountPage, /setOrdersStatus\("error"\)/);
  assert.match(accountPage, /Unable to load your orders\./);
  assert.match(accountPage, /Loading your orders\.\.\./);
  assert.match(accountPage, /Try again/);
});

test("customer order actions use a stable aligned grid on desktop and mobile", () => {
  assert.match(accountPage, /styles\.listItem\} \$\{styles\.orderListItem/);
  assert.match(accountStyles, /\.orderListItem\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(accountStyles, /\.orderListItem > \.orderActions\s*\{[\s\S]*?justify-self: end/);
  assert.match(accountStyles, /\.orderListItem > \.orderActions \.orderActionButton\s*\{[\s\S]*?min-width: 9\.25rem/);
  assert.match(accountStyles, /@media \(max-width: 720px\)[\s\S]*?\.orderListItem\s*\{[\s\S]*?grid-template-columns: 1fr/);
});
