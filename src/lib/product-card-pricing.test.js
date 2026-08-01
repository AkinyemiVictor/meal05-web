import assert from "node:assert/strict";
import { test } from "node:test";

import { selectProductCardVariant } from "./product-card-pricing.js";

const variant = (id, price, overrides = {}) => ({
  id,
  market_id: "ibadan",
  is_active: true,
  stock_count: 10,
  price,
  ...overrides,
});

test("selects the lowest selling price across differently priced variants", () => {
  const selected = selectProductCardVariant(
    [variant(1, 5000), variant(2, 2000), variant(3, 8000), variant(4, 500, { market_id: "lagos" })],
    { marketId: "ibadan" }
  );

  assert.equal(selected.variant.id, 2);
  assert.equal(selected.price, 2000);
  assert.equal(selected.variantCount, 3);
  assert.equal(selected.hasMultipleOptions, true);
});

test("ignores an inactive lowest-price variant", () => {
  const selected = selectProductCardVariant([
    variant(1, 500, { is_active: false }),
    variant(2, 2000),
  ]);

  assert.equal(selected.variant.id, 2);
  assert.equal(selected.variantCount, 1);
});

test("ignores a zero-price placeholder variant", () => {
  const selected = selectProductCardVariant([variant(1, 0), variant(2, 2500)]);

  assert.equal(selected.variant.id, 2);
  assert.equal(selected.price, 2500);
});

test("prefers an in-stock option over a cheaper depleted option", () => {
  const selected = selectProductCardVariant([
    variant(1, 1000, { stock_count: 0 }),
    variant(2, 3000, { stock_count: 4 }),
  ]);

  assert.equal(selected.variant.id, 2);
  assert.equal(selected.price, 3000);
  assert.equal(selected.inStock, true);
});

test("uses the lowest active price when every option is depleted", () => {
  const selected = selectProductCardVariant([
    variant(1, 5000, { stock_count: 0 }),
    variant(2, 2000, { stock_count: 0 }),
    variant(3, 8000, { stock_count: 0 }),
  ]);

  assert.equal(selected.variant.id, 2);
  assert.equal(selected.price, 2000);
  assert.equal(selected.inStock, false);
});

test("keeps old price and discount from the selected display variant", () => {
  const selected = selectProductCardVariant([
    variant(1, 2000, { old_price: 2500 }),
    variant(2, 5000, { old_price: 10000 }),
  ]);

  assert.equal(selected.variant.id, 1);
  assert.equal(selected.price, 2000);
  assert.equal(selected.oldPrice, 2500);
  assert.equal(selected.discount, 20);
});
