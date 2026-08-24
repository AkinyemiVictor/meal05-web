import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const catalogueClient = read("src/lib/use-catalog-products.js");
const quickAdd = read("src/components/quick-add-drawer.js");
const nextConfig = read("next.config.mjs");
const layout = read("src/app/layout.js");
const reviewGateCss = read("src/styles/product-reviews-launch.css");
const schema = read("src/lib/seo/schema.js");

test("catalogue products cannot make Quick Add skip canonical commerce metadata", () => {
  assert.match(catalogueClient, /requireCanonicalQuickAddMetadata/);
  assert.match(catalogueClient, /optionsLoaded: false/);
  assert.match(quickAdd, /fetch\(`\/api\/products\/\$\{productId\}`\)/);
  assert.match(quickAdd, /SizePreferencePicker/);
});

test("Cloudflare product images bypass the Next runtime optimizer", () => {
  assert.match(nextConfig, /images:\s*\{[\s\S]*?unoptimized:\s*true/);
  assert.match(nextConfig, /storage\/v1\/object\/public/);
});

test("unverified launch reviews are hidden and excluded from product rating schema", () => {
  assert.match(layout, /product-reviews-launch\.css/);
  assert.match(reviewGateCss, /\.product-detail-rating/);
  assert.match(reviewGateCss, /\.product-detail-section--reviews/);
  assert.match(reviewGateCss, /display:\s*none\s*!important/);
  assert.match(schema, /PRODUCT_RATINGS_SCHEMA_ENABLED = false/);
  assert.match(schema, /PRODUCT_RATINGS_SCHEMA_ENABLED \? toFiniteNumber\(ratings\?\.average\) : null/);
});
