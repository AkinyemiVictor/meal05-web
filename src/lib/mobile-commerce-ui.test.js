import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("Browse provides a mobile product search control", () => {
  const page = read("src/app/shop/page.js");
  const css = read("src/app/shop/shop.css");

  assert.match(page, /role="search"/);
  assert.match(page, /action="\/search"/);
  assert.match(page, /name="q"/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.shop-page__search/);
});

test("mobile product options use a responsive button grid", () => {
  const css = read("src/styles/main.css");
  const finalPickerRule = css.lastIndexOf(".product-detail-page .product-variant-picker__options");
  const finalSingleColumnRule = css.lastIndexOf("grid-template-columns: 1fr");

  assert.ok(finalPickerRule > finalSingleColumnRule);
  assert.match(css.slice(finalPickerRule, finalPickerRule + 240), /repeat\(auto-fit, minmax\(5\.5rem, 1fr\)\)/);
});

test("Account overview uses complete Tabler icons and charcoal surfaces", () => {
  const page = read("src/app/account/page.js");
  const css = read("src/app/account/account.module.css");

  for (const icon of ["IconMapPin", "IconPackage", "IconWallet", "IconReceiptRefund", "IconUsersPlus", "IconHelpCircle", "IconMessageCircle", "IconBell", "IconFileDescription"]) {
    assert.match(page, new RegExp(`\\b${icon}\\b`));
  }
  assert.match(css, /\.accountAvatar\s*\{[\s\S]*?background:\s*#141622/);
  assert.match(css, /\.accountMenuIcon\s*\{[\s\S]*?color:\s*#141622/);
});

test("quantity limits identify product-option limits", () => {
  const quantity = read("src/lib/product-quantity.js");
  assert.match(quantity, /Maximum for this option is/);
});
