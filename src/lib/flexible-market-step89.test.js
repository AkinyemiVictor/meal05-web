import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const activation = read("docs/flexible-market-first-wave-activation.md");
const productDetail = read("src/components/product-detail-client.js");
const quickAdd = read("src/components/quick-add-drawer.js");
const cartRoute = read("src/app/api/cart/route.js");
const orderRoute = read("src/app/api/orders/route.js");
const commerceOptions = read("src/lib/commerce-options.js");
const adminStatus = read("src/components/admin-order-status-control.js");
const adminPreferenceRoute = read("src/app/api/admin/orders/[id]/size-preferences/route.js");

test("first-wave activation is limited to the four approved Flexible + Standard products", () => {
  for (const id of [603, 602, 117, 1004]) {
    assert.match(activation, new RegExp(`\\| ${id} \\|`));
  }
  assert.match(activation, /No Request product is part of this first wave/);
  assert.match(activation, /Do not change `availability_mode`, `inventory_tracking_mode`, prices, stock counts, active flags, or variant IDs/);
  assert.match(activation, /Rollback-only canary completed/i);
  assert.match(activation, /live-database canary was executed/i);
});

test("product detail and Quick Add both use the shared Preferred size control", () => {
  assert.match(productDetail, /SizePreferencePicker/);
  assert.match(productDetail, /sizePreference/);
  assert.match(quickAdd, /SizePreferencePicker/);
  assert.match(quickAdd, /sizePreference/);
});

test("canonical cart validates flexible preference and commerce options default flexible products to best available", () => {
  assert.match(cartRoute, /SELECTION_MODE_FLEXIBLE/);
  assert.match(cartRoute, /normalizeSizePreference/);
  assert.match(cartRoute, /size_preference/);
  assert.match(commerceOptions, /SELECTION_MODE_FLEXIBLE = "flexible_market"/);
  assert.match(commerceOptions, /String\(value \|\| "best_available"\)/);
});

test("Flexible + Standard remains normal order checkout while Request remains the availability trigger", () => {
  assert.match(orderRoute, /availabilityMode === "request"/);
  assert.match(orderRoute, /AVAILABILITY_CONFIRMATION_REQUIRED/);
  assert.match(orderRoute, /productMeta\?\.selectionModel === SELECTION_MODE_FLEXIBLE/);
  assert.match(orderRoute, /size_preference: c\.size_preference \|\| null/);
});

test("fulfilment staff can see persisted Preferred size on general order management", () => {
  assert.match(adminStatus, /Fulfilment size preference/);
  assert.match(adminStatus, /Preference guides physical piece size only; fulfil the paid quantity or value/);
  assert.match(adminStatus, /\/size-preferences/);
  assert.match(adminPreferenceRoute, /hasAdminAccess/);
  assert.match(adminPreferenceRoute, /size_preference/);
  assert.match(adminPreferenceRoute, /SIZE_PREFERENCE_LABELS/);
});
