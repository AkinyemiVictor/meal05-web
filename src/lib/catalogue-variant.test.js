import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const source = readFileSync(resolve(process.cwd(), "src/lib/catalogue.js"), "utf8");

test("catalogue normalization keeps the canonical variant identity and quantity rules", () => {
  assert.match(source, /variantId:\s*[\s\S]*?variant\.variantId[\s\S]*?variant\.variationId/);
  assert.match(source, /maxQuantity:\s*variant\.maxQuantity\s*\?\?/);
  assert.match(source, /stepQuantity:\s*variant\.stepQuantity\s*\?\?/);
  assert.match(source, /variations:\s*Array\.isArray\(item\.variations\)\s*\?\s*item\.variations\s*:\s*\[\]/);
  assert.match(source, /optionsLoaded:\s*item\.optionsLoaded\s*===\s*true/);
});

test("quick add uses catalogue options without waiting for a second product request", () => {
  const drawer = readFileSync(resolve(process.cwd(), "src/components/quick-add-drawer.js"), "utf8");

  assert.match(drawer, /product\?\.optionsLoaded\s*===\s*true/);
  assert.match(drawer, /applyData\(\{\s*product,\s*variations:\s*embeddedVariations\s*\}\)/);
  assert.ok(
    drawer.indexOf("product?.optionsLoaded === true") < drawer.indexOf("fetch(`/api/products/${productId}`)"),
    "embedded catalogue options should be applied before the detail-request fallback"
  );
});

test("cart product lookup tracks the active request before reporting availability", () => {
  const hook = readFileSync(resolve(process.cwd(), "src/lib/use-catalog-products.js"), "utf8");
  const cart = readFileSync(resolve(process.cwd(), "src/app/cart/page.js"), "utf8");

  assert.match(hook, /requestKey:\s*key/);
  assert.match(hook, /state\.requestKey\s*!==\s*key/);
  assert.match(cart, /productLookupStatus\s*===\s*"loading"/);
  assert.match(cart, /hasError\s*\|\|\s*stockStatus\.hasPending/);
});
