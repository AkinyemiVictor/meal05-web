import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { getHomeSidebarFrame } from "./home-sidebar.js";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

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

test("home restores the MealKit collection filter", () => {
  const home = read("src/app/home/page.js");

  assert.match(home, /value:\s*"bundles",\s*label:\s*"MealKit"/);
  assert.match(home, /activeCollection === "bundles"/);
  assert.match(home, /product\.isBundleEligible/);
  assert.match(home, /seeAllHref:\s*"\/section\/bundle-plans"/);
});

test("quantity-cap migration changes only options capped at ten", () => {
  const migration = read("supabase/migrations/20260801224305_increase_product_option_cap_to_25.sql");

  assert.match(migration, /set\s+max_quantity\s*=\s*25/i);
  assert.match(migration, /where\s+max_quantity\s*=\s*10/i);
});
