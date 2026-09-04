import test from "node:test";
import assert from "node:assert/strict";

import { sortVariantsBySize } from "./variant-order.js";

test("sorts same-unit product options from smallest to largest", () => {
  const variants = [
    { id: 3, base_quantity: 30, base_unit: "finger", price: 8700 },
    { id: 1, base_quantity: 6.5, base_unit: "finger", price: 2200 },
    { id: 2, base_quantity: 13.5, base_unit: "finger", price: 4300 },
  ];

  assert.deepEqual(sortVariantsBySize(variants).map((variant) => variant.id), [1, 2, 3]);
});

test("uses total price when option sizes use different units", () => {
  const variants = [
    { id: 3, base_quantity: 1, base_unit: "bunch", price: 18000 },
    { id: 2, base_quantity: 10, base_unit: "finger", price: 6000 },
    { id: 1, base_quantity: 6.5, base_unit: "finger", price: 4000 },
  ];

  assert.deepEqual(sortVariantsBySize(variants).map((variant) => variant.id), [1, 2, 3]);
});
