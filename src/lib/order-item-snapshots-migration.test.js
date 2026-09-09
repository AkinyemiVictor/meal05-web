import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260906030236_preserve_order_item_details.sql"),
  "utf8"
);
const triggerMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260906031241_populate_order_item_snapshots.sql"),
  "utf8"
);
const imageMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260906040000_snapshot_order_item_images.sql"),
  "utf8"
);
const supplierCostMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260908221500_snapshot_order_item_supplier_cost.sql"),
  "utf8"
);
const profitIndexMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260908222500_index_profit_dashboard_queries.sql"),
  "utf8"
);

test("order item migration adds and backfills immutable display snapshots", () => {
  assert.match(migration, /add column if not exists product_name text/);
  assert.match(migration, /add column if not exists variant_name text/);
  assert.match(migration, /add column if not exists unit text/);
  assert.match(migration, /product\.name/);
  assert.match(migration, /variant\.display_label/);
  assert.match(migration, /alter column product_name set not null/);
});

test("order lines retain the product image shown when they were purchased", () => {
  assert.match(imageMigration, /add column if not exists image_url text/);
  assert.match(imageMigration, /set image_url = nullif\(btrim\(product\.main_image_url\), ''\)/);
  assert.match(imageMigration, /new\.image_url := coalesce/);
});

test("database inserts populate snapshots when an older caller omits them", () => {
  assert.match(triggerMigration, /before insert on public\.order_items/);
  assert.match(triggerMigration, /new\.product_name := coalesce/);
  assert.match(triggerMigration, /variant\.display_label/);
  assert.match(triggerMigration, /revoke all on function public\.populate_order_item_snapshots\(\) from public, anon, authenticated/);
});

test("order lines preserve configured supplier cost for historical gross profit", () => {
  assert.match(supplierCostMigration, /add column if not exists supplier_unit_cost numeric/);
  assert.match(supplierCostMigration, /new\.supplier_unit_cost := supplier_cost_snapshot/);
  assert.match(supplierCostMigration, /candidate\.is_primary or candidate\.supplier_count = 1/);
  assert.match(supplierCostMigration, /before insert on public\.order_items/);
  assert.doesNotMatch(supplierCostMigration, /update public\.order_items[\s\S]*supplier_unit_cost/i);
});

test("profit dashboard lookups have targeted supporting indexes", () => {
  assert.match(profitIndexMigration, /order_items_supplier_id_idx/);
  assert.match(profitIndexMigration, /orders_paid_at_paid_idx/);
  assert.match(profitIndexMigration, /where payment_status = 'paid'/);
});
