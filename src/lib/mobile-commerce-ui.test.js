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

test("product options never exceed three columns and stay readable on mobile", () => {
  const css = read("src/styles/main.css");
  const basePickerRule = css.indexOf(".product-variant-picker__options {");
  const finalPickerRule = css.lastIndexOf(".product-detail-page .product-variant-picker__options");

  assert.match(css.slice(basePickerRule, basePickerRule + 240), /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css.slice(finalPickerRule, finalPickerRule + 240), /repeat\(2, minmax\(0, 1fr\)\)/);
});

test("quick-add modal keeps two readable option cards and scrolls instead of scaling down", () => {
  const css = read("src/styles/main.css");
  const modalRule = css.lastIndexOf(".quick-add-panel--mobile-modal {");
  const optionsRule = css.lastIndexOf(".quick-add-panel--mobile-modal .product-variant-picker__options");

  assert.match(css.slice(modalRule, modalRule + 500), /max-height:\s*min\(680px, calc\(100dvh - 1\.5rem\)\)/);
  assert.doesNotMatch(css, /--quick-add-scale:\s*0\./);
  assert.match(css.slice(optionsRule, optionsRule + 260), /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css.slice(optionsRule, optionsRule + 700), /overflow-wrap:\s*anywhere/);
});

test("quick-add quantity controls share an active colour and only fade when disabled", () => {
  const css = read("src/styles/main.css");
  const controlsRule = css.lastIndexOf(".quick-add-panel--mobile-modal .quick-add-qty button {");
  const disabledRule = css.lastIndexOf(".quick-add-panel--mobile-modal .quick-add-qty button:disabled {");

  assert.match(css.slice(controlsRule, controlsRule + 260), /background:\s*#11131f/);
  assert.match(css.slice(controlsRule, controlsRule + 260), /color:\s*#ffffff/);
  assert.match(css.slice(disabledRule, disabledRule + 260), /background:\s*#f1f2f4/);
  assert.match(css.slice(disabledRule, disabledRule + 260), /opacity:\s*1/);
  assert.doesNotMatch(css, /\.quick-add-panel--mobile-modal \.quick-add-qty button:last-child/);
});

test("product-detail and cart quantity controls use the same active and disabled states", () => {
  const css = read("src/styles/main.css");
  const cartCss = read("src/app/cart/cart.module.css");
  const productForm = read("src/components/add-to-cart-form.js");
  const cartPage = read("src/app/cart/page.js");
  const detailButtonRule = css.lastIndexOf(".product-detail-page .product-detail-actions__stepper {");
  const detailDisabledRule = css.lastIndexOf(".product-detail-page .product-detail-actions__stepper:disabled {");
  const cartButtonRule = cartCss.indexOf(".qtyButton {");
  const cartDisabledRule = cartCss.indexOf(".qtyButton:disabled {");

  assert.match(css.slice(detailButtonRule, detailButtonRule + 240), /background:\s*#11131f/);
  assert.match(css.slice(detailDisabledRule, detailDisabledRule + 240), /background:\s*#ffffff/);
  assert.doesNotMatch(css, /\.product-detail-page \.product-detail-actions__stepper:last-child/);
  assert.match(cartCss.slice(cartButtonRule, cartButtonRule + 260), /background:\s*#11131f/);
  assert.match(cartCss.slice(cartDisabledRule, cartDisabledRule + 220), /background:\s*#ffffff/);
  assert.doesNotMatch(cartCss, /\.qtyButton:last-child/);
  assert.match(productForm, /effectiveMaxQuantity\s*!=\s*null\s*&&\s*safeQuantity\s*>=\s*effectiveMaxQuantity/);
  assert.match(productForm, /FIXED_QUANTITY_BLOCKED_KEYS/);
  assert.match(productForm, /event\.target\.value\.replace\(\/\\D\/g, ""\)/);
  assert.match(productForm, /type=\{isLoose \? "number" : "text"\}/);
  assert.match(productForm, /pattern=\{isLoose \? undefined : "\[0-9\]\*"\}/);
  assert.match(cartPage, /Math\.min\(maxQuantity\s*\?\?\s*availableCount,\s*availableCount\)/);
});

test("search results use one continuous product grid without category partitions", () => {
  const searchResults = read("src/components/search-results-client.js");
  const css = read("src/styles/main.css");

  assert.match(searchResults, /products=\{products\}/);
  assert.doesNotMatch(searchResults, /groupedResults|search-results-group|Category<\/span>/);
  assert.doesNotMatch(css, /\.search-results-group__header/);
});

test("product-detail options render immediately for every purchase mode", () => {
  const detail = read("src/components/product-detail-client.js");
  const picker = read("src/components/variant-picker.js");

  assert.match(detail, /\{selectableVariations\.length\s*\?\s*\(/);
  assert.match(detail, /key=\{purchaseMode\}/);
  assert.doesNotMatch(detail, /purchaseMode\s*===\s*PURCHASE_MODE_FIXED\s*&&\s*selectableVariations\.length/);
  assert.match(picker, /displayedVariant\s*=\s*selectedVariant\s*\|\|\s*safeVariations\[0\]/);
  assert.doesNotMatch(picker, /useEffect|useState/);
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
