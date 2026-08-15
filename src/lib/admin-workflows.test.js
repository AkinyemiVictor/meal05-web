import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  getOrderRefundStatusLabel,
  normalizeOrderRefundStatus,
} from "./order-support.js";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("manual refund decisions are explicit and never initiate money movement", () => {
  const migration = read("supabase/migrations/20260815120000_manual_order_refund_tracking.sql");
  const decisionRoute = read("src/app/api/admin/orders/support-cases/refund-status/route.js");
  const control = read("src/components/admin-manual-refund-control.js");

  assert.equal(normalizeOrderRefundStatus("refunded"), "refunded");
  assert.equal(normalizeOrderRefundStatus("pending", "replacement"), "not_required");
  assert.equal(getOrderRefundStatusLabel("not_required"), "No Refund Required");
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.order_support_cases from anon, authenticated/i);
  assert.match(migration, /refund_status in \('pending', 'refunded', 'not_required'\)/i);
  assert.match(decisionRoute, /money_moved:\s*false/);
  assert.match(decisionRoute, /external_bank_transfer_record_only:\s*true/);
  assert.doesNotMatch(decisionRoute, /refund_order_to_wallet|\.from\("refunds"\)/);
  assert.match(control, /Mark as refunded/);
  assert.match(control, /No refund required/);
  assert.match(control, /will not move any money/);
});

test("catalogue delegates price and stock mutations to their canonical workflows", () => {
  const catalogue = read("src/app/admin/(secure)/catalogue/page.js");
  const productRoute = read("src/app/api/admin/products/update/route.js");

  assert.doesNotMatch(catalogue, /AdminRestockControl/);
  assert.match(catalogue, /Restock in Inventory/);
  assert.doesNotMatch(catalogue, /showPrice|showStock/);
  assert.doesNotMatch(read("src/components/admin-product-catalog-control.js"), /showPrice|showStock|oldPriceValue|stockValue/);
  assert.doesNotMatch(productRoute, /stock_count:\s*z\./);
  assert.doesNotMatch(productRoute, /variantPatch\.price|variantPatch\.stock_count/);
  assert.equal(existsSync(resolve(process.cwd(), "src/app/api/admin/prices/update/route.js")), false);
});

test("site notifications are server-managed, secured, and storefront-backed", () => {
  const migration = read("supabase/migrations/20260729120000_site_notifications.sql");
  const adminRoute = read("src/app/api/admin/site-notifications/route.js");
  const storefrontRoute = read("src/app/api/site-notification/route.js");
  const layout = read("src/app/layout.js");

  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.site_notifications from anon, authenticated/i);
  assert.doesNotMatch(migration, /auth\.role\(\)/);
  assert.match(adminRoute, /requireAdminApiUser/);
  assert.match(adminRoute, /checkRateLimit/);
  assert.match(storefrontRoute, /loadActiveSiteNotification/);
  assert.match(layout, /SiteNotificationPopup/);
});
