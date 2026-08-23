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

test("mobile commerce header keeps the Meal05 logo, wallet, icon-only location, and notifications accessible", () => {
  const header = read("src/components/meal05-header.js");
  const headerActions = read("src/components/meal05-header-actions.js");
  const mobileHeader = header.slice(
    header.indexOf('meal05-header--mobile'),
    header.indexOf('meal05-header--desktop')
  );

  assert.match(mobileHeader, /<Link href="\/" aria-label="Meal05 home"/);
  assert.match(mobileHeader, /src=\{LOGO_SRC\}/);
  assert.match(mobileHeader, /<Meal05HeaderActions mobile \/>/);
  assert.match(headerActions, /if \(mobile\)[\s\S]*<DeferredLocationPicker mobileHeader iconOnly \/>[\s\S]*href="\/notifications"/);
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
  assert.match(banner, /Market fresh<br \/>[\s\S]*groceries, <em>delivered<\/em>/);
  assert.match(banner, /Less market stress\. Less price wahala \. More time for what matters\./);
  assert.match(banner, /<Link[\s\S]*?href="\/shop"/);
  assert.match(banner, /Go to shop/);
  assert.match(banner, /prefetchShop\(router\)/);
  assert.match(banner, /--welcome-content-scale/);
  assert.match(banner, /meal05 - store man\.png/);
  assert.doesNotMatch(banner, /welcome-seasonal__cards/);
  assert.doesNotMatch(banner, /canvas\.style\.(height|width)/);
  assert.match(styles, /\.welcome-banner\.welcome-banner--seasonal[\s\S]*aspect-ratio:\s*5 \/ 2/);
  assert.match(styles, /\.welcome-seasonal__content[\s\S]*width:\s*1200px;[\s\S]*height:\s*480px;[\s\S]*scale\(var\(--welcome-content-scale\)\)/);
  assert.doesNotMatch(styles, /@media \(max-width: 900px\)[\s\S]*?\.welcome-seasonal__content[\s\S]*?transform:\s*none/);
  assert.match(banner, /welcome-seasonal__content">[\s\S]*welcome-seasonal__leaf/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.welcome-seasonal__copy h2 \{[\s\S]*?font-size:\s*62px/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.welcome-seasonal__copy > p \{[\s\S]*?font-size:\s*23px/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.welcome-seasonal__actions > a \{[\s\S]*?font-size:\s*20px/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.welcome-seasonal__actions > span \{[\s\S]*?font-size:\s*17px/);
});

test("mobile category cards use readable names and item counts", () => {
  const categories = read("src/components/home-category-navigation.js");

  assert.match(categories, /text-\[13px\] font-bold/);
  assert.match(categories, /text-\[12px\] font-semibold/);
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

test("product option buttons retain each variant's price without repeating the unit", () => {
  const picker = read("src/components/variant-picker.js");

  assert.match(picker, /product-variant-picker__option-price/);
  assert.match(picker, /formatProductPrice\(variant\?\.price\)/);
  assert.doesNotMatch(picker, /formatProductPrice\(variant\?\.price,\s*variant\?\.unit\)/);
});

test("product detail loaders order options from smallest base quantity to largest", () => {
  const server = read("src/lib/products-server.js");
  const api = read("src/app/api/products/[id]/route.js");
  const expectedOrder = /\.order\("base_quantity",\s*\{\s*ascending:\s*true,\s*nullsFirst:\s*false\s*\}\)[\s\S]*?\.order\("id",\s*\{\s*ascending:\s*true\s*\}\)/;

  assert.match(server, expectedOrder);
  assert.match(api, expectedOrder);
});

test("shop navigation preloads on intent without restoring idle request amplification", () => {
  const prefetch = read("src/lib/shop-prefetch.js");
  const shop = read("src/app/shop/page.js");
  const mobileNav = read("src/components/mobile-bottom-nav.js");

  assert.match(prefetch, /SHOP_FIRST_PAGE_CATALOG_URL\s*=\s*"\/api\/catalog\/cards\?page=1&pageSize=20&sort=default"/);
  assert.match(prefetch, /router\?\.prefetch\?\.\(SHOP_ROUTE\)/);
  assert.match(prefetch, /prefetchCatalogProducts\(SHOP_FIRST_PAGE_CATALOG_URL\)/);
  assert.match(prefetch, /prefetchCategories\(\)/);
  assert.match(shop, /currentPage === 1[\s\S]*SHOP_FIRST_PAGE_CATALOG_URL/);
  assert.match(mobileNav, /prefetch=\{false\}/);
  assert.match(mobileNav, /onPointerEnter=\{item\.href === "\/shop" \? \(\) => void prefetchShop\(router\)/);
  assert.match(mobileNav, /onFocus=\{item\.href === "\/shop" \? \(\) => void prefetchShop\(router\)/);
  assert.match(mobileNav, /onTouchStart=\{item\.href === "\/shop" \? \(\) => void prefetchShop\(router\)/);
  assert.doesNotMatch(mobileNav, /requestIdleCallback/);
});

test("quantity-cap migration changes only options capped at ten", () => {
  const migration = read("supabase/migrations/20260801224305_increase_product_option_cap_to_25.sql");

  assert.match(migration, /set\s+max_quantity\s*=\s*25/i);
  assert.match(migration, /where\s+max_quantity\s*=\s*10/i);
});
