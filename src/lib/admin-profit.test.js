import assert from "node:assert/strict";
import test from "node:test";

import { startOfLagosBusinessDayIso, summarizeGrossProductProfit } from "./admin-profit.js";

test("daily admin metrics start at midnight in Lagos", () => {
  assert.equal(
    startOfLagosBusinessDayIso(new Date("2026-09-08T00:30:00.000Z")),
    "2026-09-07T23:00:00.000Z"
  );
});

test("gross product profit uses purchase-time supplier cost for every quantity", () => {
  const result = summarizeGrossProductProfit([
    {
      order_items: [
        { quantity: 2, price: 1500, supplier_unit_cost: 1000 },
        { quantity: 1, price: 800, supplier_unit_cost: 500 },
      ],
    },
  ]);

  assert.equal(result.status, "complete");
  assert.equal(result.merchandiseRevenue, 3800);
  assert.equal(result.supplierCost, 2500);
  assert.equal(result.grossProfit, 1300);
  assert.equal(Math.round(result.marginPercent * 10) / 10, 34.2);
});

test("gross product profit is unavailable rather than understated when a cost is missing", () => {
  const result = summarizeGrossProductProfit([
    {
      order_items: [
        { quantity: 1, price: 1500, supplier_unit_cost: 1000 },
        { quantity: 1, price: 800, supplier_unit_cost: null },
      ],
    },
  ]);

  assert.equal(result.status, "incomplete");
  assert.equal(result.missingCostLineCount, 1);
  assert.equal(result.grossProfit, null);
  assert.equal(result.marginPercent, null);
});

test("gross product profit reports zero only when there are no paid purchase lines", () => {
  const result = summarizeGrossProductProfit([]);

  assert.equal(result.status, "no_sales");
  assert.equal(result.grossProfit, 0);
  assert.equal(result.lineCount, 0);
});
