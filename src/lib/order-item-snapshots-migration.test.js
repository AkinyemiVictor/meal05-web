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

test("order item migration adds and backfills immutable display snapshots", () => {
  assert.match(migration, /add column if not exists product_name text/);
  assert.match(migration, /add column if not exists variant_name text/);
  assert.match(migration, /add column if not exists unit text/);
  assert.match(migration, /product\.name/);
  assert.match(migration, /variant\.display_label/);
  assert.match(migration, /alter column product_name set not null/);
});

test("database inserts populate snapshots when an older caller omits them", () => {
  assert.match(triggerMigration, /before insert on public\.order_items/);
  assert.match(triggerMigration, /new\.product_name := coalesce/);
  assert.match(triggerMigration, /variant\.display_label/);
  assert.match(triggerMigration, /revoke all on function public\.populate_order_item_snapshots\(\) from public, anon, authenticated/);
});
