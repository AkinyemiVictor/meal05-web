import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clampQuantityToRules,
  getVariantPurchaseRules,
  validateVariantQuantity,
} from "./product-quantity.js";

test("null quantity limits remain unlimited instead of becoming zero", () => {
  const variant = {
    purchase_mode: "fixed",
    min_quantity: 1,
    max_quantity: null,
    step_quantity: 1,
  };

  assert.equal(getVariantPurchaseRules(variant).maxQuantity, null);
  assert.equal(clampQuantityToRules(variant, 3), 3);
  assert.deepEqual(validateVariantQuantity(variant, 3).ok, true);
});

test("empty optional quantity fields use their documented defaults", () => {
  const rules = getVariantPurchaseRules({
    min_quantity: "",
    max_quantity: "",
    step_quantity: "",
  });

  assert.equal(rules.minQuantity, 1);
  assert.equal(rules.maxQuantity, null);
  assert.equal(rules.stepQuantity, 1);
});
