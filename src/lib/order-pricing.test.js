import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

    return {
      shortCircuit: true,
      url: pathToFileURL(resolve(process.cwd(), "src", `${specifier.slice(2)}.js`)).href,
    };
  },
});

const { applyPromoToOrderSummary, computeOrderSummary } = await import("./order-pricing.js");

test("orders below the former minimum do not receive a handling fee", () => {
  const summary = computeOrderSummary([{ quantity: 1, price: 4000 }]);

  assert.equal(summary.subtotal, 4000);
  assert.equal(summary.packagingFee, 200);
  assert.equal(summary.deliveryFee, 1500);
  assert.equal(summary.handlingFee, 0);
  assert.equal(summary.total, 5700);
});

test("legacy handling values cannot be reintroduced when applying a promotion", () => {
  const summary = applyPromoToOrderSummary(
    {
      itemsCount: 1,
      subtotal: 4000,
      packagingFee: 200,
      handlingFee: 1000,
      deliveryFee: 1500,
    },
    null
  );

  assert.equal(summary.handlingFee, 0);
  assert.equal(summary.total, 5700);
});
