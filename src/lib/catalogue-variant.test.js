import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const source = readFileSync(resolve(process.cwd(), "src/lib/catalogue.js"), "utf8");

test("catalogue normalization keeps the canonical variant identity and quantity rules", () => {
  assert.match(source, /variantId:\s*[\s\S]*?variant\.variantId[\s\S]*?variant\.variationId/);
  assert.match(source, /maxQuantity:\s*variant\.maxQuantity\s*\?\?/);
  assert.match(source, /stepQuantity:\s*variant\.stepQuantity\s*\?\?/);
});

test("cart product lookup tracks the active request before reporting availability", () => {
  const hook = readFileSync(resolve(process.cwd(), "src/lib/use-catalog-products.js"), "utf8");
  const cart = readFileSync(resolve(process.cwd(), "src/app/cart/page.js"), "utf8");

  assert.match(hook, /requestKey:\s*key/);
  assert.match(hook, /state\.requestKey\s*!==\s*key/);
  assert.match(cart, /productLookupStatus\s*===\s*"loading"/);
  assert.match(cart, /hasError\s*\|\|\s*stockStatus\.hasPending/);
});
