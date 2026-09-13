import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("Tag Buy pools normalize compatible options into one capacity target", () => {
  const migration = read("supabase/migrations/20260912145124_normalize_tag_buy_pools.sql");

  assert.match(migration, /create table public\.tag_batch_variants/i);
  assert.match(migration, /contribution_quantity numeric\(12,3\)/i);
  assert.match(migration, /sum\(\(line->>'quantity'\)::numeric \* m\.contribution_quantity\)/i);
  assert.match(migration, /tag_batch_variants_one_live_option_idx[\s\S]*where is_live/i);
});

test("Tag Buy checkout reserves all lines atomically and binds the result to one order", () => {
  const orders = read("src/app/api/orders/route.js");
  const migration = read("supabase/migrations/20260912145124_normalize_tag_buy_pools.sql");

  assert.match(orders, /rpc\("reserve_tag_capacity_v2"[\s\S]*p_lines: cart\.map/i);
  assert.match(orders, /rpc\("bind_tag_commitment_to_order_v2"/i);
  assert.match(migration, /where id = p_batch_id for update/i);
  assert.match(migration, /v_used \+ v_requested > v_batch\.maximum_quantity/i);
});

test("Tag Buy automation does not orphan payments awaiting staff verification", () => {
  const migration = read("supabase/migrations/20260912145124_normalize_tag_buy_pools.sql");

  assert.match(migration, /status = 'awaiting_verification'[\s\S]*raise exception 'Tag Buy has payments awaiting verification'/i);
  assert.match(migration, /cron\.schedule\([\s\S]*close_due_meal05_tag_buys[\s\S]*\*\/5 \* \* \* \*/i);
  assert.match(migration, /revoke all on function public\.close_due_tag_batches\(\) from public, anon, authenticated/i);
});

test("Tag Buy is the eligible default and remains understandable to customers", () => {
  const detail = read("src/components/add-to-cart-form.js");
  const quickAdd = read("src/components/quick-add-drawer.js");
  const explainer = read("src/components/tag-buy-explainer.js");
  const account = read("src/app/account/page.js");

  assert.match(detail, /useState\(PROCUREMENT_TAG\)/);
  assert.match(quickAdd, /useState\(PROCUREMENT_TAG\)/);
  assert.match(detail, /getTagContributionQuantity/);
  assert.match(quickAdd, /getTagContributionQuantity/);
  assert.match(explainer, /Your selected quantity stays the same/i);
  assert.match(account, /tagBatchStatus/);
});
