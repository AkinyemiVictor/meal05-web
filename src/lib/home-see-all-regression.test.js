import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("home See all navigation primes and reuses catalogue data", () => {
  const home = read("src/app/home/page.js");
  const collection = read("src/components/home-product-collection.js");
  const section = read("src/app/section/[slug]/page.js");
  const hook = read("src/lib/use-catalog-products.js");

  assert.match(home, /seeAllDataHref:\s*"\/api\/catalog\/home\?limit=72"/);
  assert.match(home, /seeAllDataHref:\s*"\/api\/catalog\/cards\?view=new&limit=48"/);
  assert.match(home, /seeAllDataHref:\s*"\/api\/catalog\/cards\?view=in-season&limit=48"/);
  assert.match(collection, /prefetchCatalogProducts/);
  assert.match(collection, /requestIdleCallback/);
  assert.match(section, /slug === "popular"[\s\S]*\/api\/catalog\/home\?limit=72/);
  assert.match(hook, /catalogueValueCache/);
  assert.match(hook, /CATALOGUE_CACHE_TTL_MS/);
});

test("favorite control uses faded hover red and immediate selected red", () => {
  const toggle = read("src/components/favorite-toggle-button.js");
  const styles = read("src/styles/main.css");

  assert.match(toggle, /favorite-toggle/);
  assert.match(toggle, /setIsSaving\(true\);[\s\S]*updateFavoriteIds[\s\S]*try \{/);
  assert.match(styles, /favorite-toggle:hover:not\(\[aria-pressed="true"\]\)/);
  assert.match(styles, /rgba\(220, 38, 38, 0\.48\)/);
  assert.match(styles, /favorite-toggle\[aria-pressed="true"\][\s\S]*#dc2626/);
});
