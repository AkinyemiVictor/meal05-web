import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20260718110000_decimal_safe_paystack_stock_finalization.sql", import.meta.url),
  "utf8",
);

test("Paystack stock finalization preserves decimal order quantities", () => {
  assert.match(migration, /sum\(quantity\)::numeric as quantity/i);
  assert.doesNotMatch(migration, /sum\(quantity\)::integer as quantity/i);
  assert.match(migration, /set stock_count = stock_count - v_item\.quantity/i);
  assert.match(migration, /-v_item\.quantity/i);
});
