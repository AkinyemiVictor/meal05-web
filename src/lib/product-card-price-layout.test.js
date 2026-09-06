import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const source = readFileSync(resolve(process.cwd(), "src/components/product-card.js"), "utf8");

test("unavailable multi-option products do not render the overflowing From prefix", () => {
  assert.match(source, /const pricePrefix = product\.hasMultipleOptions && currentPrice > 0 \? "From " : ""/);
  assert.match(source, /\{pricePrefix\}\{formattedPrice\}/);
});

test("product prices can wrap safely inside narrow desktop grid cards", () => {
  assert.match(source, /product-card__price-row flex min-w-0 flex-wrap/);
  assert.doesNotMatch(source, /items-baseline gap-2 whitespace-nowrap/);
});
