import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const productCard = read("src/components/product-card.js");
const quickAdd = read("src/components/quick-add-drawer.js");
const productRoute = read("src/app/api/products/[id]/route.js");
const productImage = read("src/lib/product-image.js");

test("product-card Quick Add always requests canonical option metadata", () => {
  assert.match(productCard, /optionsLoaded:\s*false/);
  assert.match(productCard, /handler\?\.\(quickAddProduct, event\.currentTarget\)/);
  assert.match(quickAdd, /fetch\(`\/api\/products\/\$\{productId\}`\)/);
  assert.match(productRoute, /selectionModel:\s*marketData\.selection_model \|\| "exact_variant"/);
});

test("Quick Add renders the shared Preferred size picker for canonical Flexible products", () => {
  assert.match(quickAdd, /isFlexibleMarket/);
  assert.match(quickAdd, /<SizePreferencePicker/);
  assert.match(quickAdd, /selectionModel === SELECTION_MODE_FLEXIBLE/);
});

test("stored Next image optimizer URLs are unwrapped before reuse", () => {
  assert.match(productImage, /const NEXT_IMAGE_PATH = "\/_next\/image"/);
  assert.match(productImage, /parsed\.searchParams\.get\("url"\)/);
  assert.match(productImage, /const trimmed = unwrapNextImageUrl\(value\)/);
});
