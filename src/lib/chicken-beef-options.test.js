import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910171802_update_chicken_beef_bone_in_options.sql"),
  "utf8"
);

const expectedOptionOccurrences = new Map([
  ["500g", 6],
  ["1kg", 6],
  ["Quarter Carton (2–2.25kg)", 4],
  ["Half Carton (4–4.5kg)", 4],
  ["1 Carton (8–9kg)", 4],
]);

test("chicken and bone-in beef keep the established fixed-option architecture", () => {
  assert.match(migration, /FROZEN-BROILER-CHICKEN-10KG/);
  assert.match(migration, /COW-MEAT-ASSORTED/);
  assert.match(migration, /selection_model = 'exact_variant'/);
  assert.match(migration, /purchase_mode,[\s\S]*option_role/);
  assert.match(migration, /'NGN', 'fixed'/);
  assert.match(migration, /set is_active = false,[\s\S]*is_default = false/);

  for (const [option, occurrences] of expectedOptionOccurrences) {
    assert.equal(migration.split(`'${option}'`).length - 1, occurrences, `${option} should be defined for both products`);
  }
});

test("chicken fixed prices match the approved values", () => {
  for (const price of [2750, 5500, 11688, 23375, 46750]) {
    assert.match(migration, new RegExp(`v_chicken_id,[^\\n]+${price}`));
  }
});

test("beef bone-in fixed prices match the approved values", () => {
  for (const price of [3750, 7500, 15938, 31875, 63750]) {
    assert.match(migration, new RegExp(`v_beef_id,[^\\n]+${price}`));
  }
});
