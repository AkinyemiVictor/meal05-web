import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { getHomeSidebarFrame } from "./home-sidebar.js";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("root opens Home while the marketing experience remains available at Landing", () => {
  const root = read("src/app/page.js");
  const landing = read("src/app/landing/page.js");
  const commerceChrome = read("src/lib/commerce-chrome.js");
  const sitemap = read("src/app/sitemap.js");

  assert.match(root, /redirect\("\/home"\)/);
  assert.match(landing, /function LandingPage/);
  assert.match(landing, /\.\.\/landing\.module\.css/);
  assert.match(landing, /canonical:\s*"\/landing"/);
  assert.match(commerceChrome, /"\/landing"/);
  assert.match(sitemap, /"\/landing"/);
});

test("mobile commerce header keeps the Meal05 logo, location, and notifications accessible", () => {
  const header = read("src/components/meal05-header.js");
  const mobileHeader = header.slice(
    header.indexOf('meal05-header--mobile'),
    header.indexOf('meal05-header--desktop')
  );

  assert.match(mobileHeader, /<Link href="\/" aria-label="Meal05 home"/);
  assert.match(mobileHeader, /src=\{LOGO_SRC\}/);
  assert.match(mobileHeader, /ml-auto[^"]*max-w-\[42vw\]/);
  assert.match(mobileHeader, /<DeferredLocationPicker mobileHeader \/>/);
  assert.match(mobileHeader, /<Meal05HeaderActions mobile showWallet=\{false\} \/>/);
});

test("desktop category sidebar expands as the document header scrolls away", () => {
  assert.deepEqual(
    getHomeSidebarFrame({ viewportHeight: 900, boundaryTop: 86, boundaryBottom: 1900 }),
    { top: 86, height: 814 }
  );
  assert.deepEqual(
    getHomeSidebarFrame({ viewportHeight: 900, boundaryTop: -414, boundaryBottom: 1400 }),
    { top: 0, height: 900 }
  );
});

test("home presents MealKit as a dedicated coming-soon collection", () => {
  const home = read("src/app/home/page.js");
  const comingSoon = read("src/components/mealkit-coming-soon.js");

  assert.match(home, /value:\s*"bundles",\s*label:\s*"MealKit"/);
  assert.match(home, /activeCollection === "bundles"/);
  assert.match(home, /<MealKitComingSoon\s*\/>/);
  assert.match(comingSoon, /mealkit-coming-soon\.webp/);
  assert.match(comingSoon, /Coming soon/);
});

test("home seasonal banner scales proportionally and uses the supplied market artwork", () => {
  const home = read("src/app/home/page.js");
  const banner = read("src/components/home-seasonal-banner.js");
  const styles = read("src/styles/main.css");

  assert.match(home, /<HomeSeasonalBanner\s*\/>/);
  assert.match(banner, /welcome \. fresh groceries/);
  assert.match(banner, /Market fresh groceries,/);
  assert.match(banner, /Less market stress\. Less price wahala \. More time for what matters\./);
  assert.match(banner, /<Link href="\/shop">/);
  assert.match(banner, /--welcome-content-scale/);
  assert.match(banner, /meal05 - store man\.png/);
  assert.doesNotMatch(banner, /welcome-seasonal__cards/);
  assert.doesNotMatch(banner, /canvas\.style\.(height|width)/);
  assert.match(styles, /\.welcome-banner\.welcome-banner--seasonal[\s\S]*aspect-ratio:\s*5 \/ 2/);
  assert.match(styles, /\.welcome-seasonal__content[\s\S]*width:\s*1200px;[\s\S]*height:\s*480px;[\s\S]*scale\(var\(--welcome-content-scale\)\)/);
  assert.doesNotMatch(styles, /@media \(max-width: 900px\)[\s\S]*?\.welcome-seasonal__content[\s\S]*?transform:\s*none/);
  assert.match(banner, /welcome-seasonal__content">[\s\S]*welcome-seasonal__leaf/);
});

test("product card catalogue migration selects the cheapest valid in-stock option", () => {
  const migration = read("supabase/migrations/20260801230601_product_card_minimum_variant_price.sql");

  assert.match(migration, /v\.market_id\s*=\s*pm\.market_id/i);
  assert.match(migration, /v\.is_active[\s\S]*v\.price\s*>\s*0/i);
  assert.match(migration, /stock_count,\s*0\)\s*>\s*0\)\s+desc,[\s\S]*v\.price\s+asc/i);
  assert.doesNotMatch(migration, /v\.is_default\s+desc/i);
  assert.match(migration, /active_variant_count/i);
});

test("Fresh In Stock metadata does not replace shared catalogue pricing", () => {
  const source = read("src/lib/fresh-stock-server.js");

  assert.doesNotMatch(source, /price:\s*meta\.price/);
  assert.doesNotMatch(source, /oldPrice:\s*meta\.oldPrice/);
  assert.match(source, /\.\.\.product,[\s\S]*isFreshInStock:\s*true/);
});

test("quick-add option buttons retain each variant's individual price", () => {
  const picker = read("src/components/variant-picker.js");

  assert.match(picker, /product-variant-picker__option-price/);
  assert.match(picker, /formatProductPrice\(variant\?\.price,\s*variant\?\.unit\)/);
});

test("quantity-cap migration changes only options capped at ten", () => {
  const migration = read("supabase/migrations/20260801224305_increase_product_option_cap_to_25.sql");

  assert.match(migration, /set\s+max_quantity\s*=\s*25/i);
  assert.match(migration, /where\s+max_quantity\s*=\s*10/i);
});
