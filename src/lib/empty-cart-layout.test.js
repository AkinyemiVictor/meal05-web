import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const page = read("src/app/cart/page.js");
const styles = read("src/app/cart/cart.module.css");

test("empty cart uses one centered message without a repeated Cart label", () => {
  assert.match(page, /className=\{styles\.emptyCartStateCopy\}/);
  assert.match(page, /Your cart is empty\./);
  assert.doesNotMatch(page, /emptyCartKicker/);
  assert.match(styles, /\.emptyCartStateCopy\s*\{[\s\S]*?justify-items:\s*center;[\s\S]*?text-align:\s*center/);
});
