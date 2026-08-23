import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const migrationPath = "supabase/migrations/20260823130857_availability_request_cancel_and_return_to_cart.sql";

test("availability cancellation is row-locked, clears payable state, and stays server-only", () => {
  const migration = read(migrationPath);

  assert.match(migration, /create or replace function public\.cancel_availability_request/);
  assert.match(migration, /from public\.availability_requests[\s\S]*for update/);
  assert.match(migration, /status = 'cancelled'/);
  assert.match(migration, /final_total = null/);
  assert.match(migration, /confirmed_at = null/);
  assert.match(migration, /payment_expires_at = null/);
  assert.match(migration, /REQUEST_ALREADY_CONVERTED/);
  assert.match(migration, /grant execute on function public\.cancel_availability_request\(uuid, uuid\) to service_role/);
  assert.match(migration, /revoke all on function public\.cancel_availability_request\(uuid, uuid\) from authenticated/);
});

test("return-to-cart is atomic, current-catalogue aware, stock-mode aware, and idempotent", () => {
  const migration = read(migrationPath);

  assert.match(migration, /add column if not exists returned_to_cart_at timestamptz/);
  assert.match(migration, /create or replace function public\.return_availability_request_to_cart/);
  assert.match(migration, /v_request\.status not in \('cancelled', 'expired', 'action_required'\)/);
  assert.match(migration, /if v_request\.returned_to_cart_at is not null/);
  assert.match(migration, /variant\.price as current_price/);
  assert.match(migration, /item\.resolution_status <> 'unavailable'/);
  assert.match(migration, /coalesce\(variant\.availability_mode, 'standard'\) <> 'unavailable'/);
  assert.match(migration, /coalesce\(variant\.inventory_tracking_mode, 'tracked'\) = 'supplier'/);
  assert.match(migration, /variant\.stock_count[\s\S]*item\.quantity \+ coalesce\(existing_cart\.quantity, 0\)/);
  assert.match(migration, /on conflict \(user_id, variant_id\) do update/);
  assert.match(migration, /public\.cart_items\.quantity \+ excluded\.quantity/);
  assert.match(migration, /when v_request\.status = 'action_required' then 'cancelled'/);
  assert.match(migration, /returned_to_cart_at = v_now/);
  assert.match(migration, /grant execute on function public\.return_availability_request_to_cart\(uuid, uuid\) to service_role/);
});

test("availability action API delegates cancel and return-to-cart to the atomic RPCs", () => {
  const route = read("src/app/api/availability-requests/[id]/actions/route.js");

  assert.match(route, /admin\.rpc\("cancel_availability_request"/);
  assert.match(route, /admin\.rpc\("return_availability_request_to_cart"/);
  assert.match(route, /returned:\s*Number\(restored\.returned \|\| 0\)/);
  assert.match(route, /skipped:\s*Number\(restored\.skipped \|\| 0\)/);
  assert.match(route, /replayed:\s*Boolean\(restored\.replayed\)/);
  const returnBlock = route.slice(
    route.indexOf('parsed.data.action === "return_to_cart"'),
    route.indexOf('parsed.data.action === "remove_unavailable_item"')
  );
  assert.doesNotMatch(returnBlock, /from\("cart_items"\).*upsert/s);
});
