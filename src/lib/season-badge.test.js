import assert from "node:assert/strict";
import { test } from "node:test";

import { getSeasonBadgeLabel, shouldShowSeasonBadge } from "./season-badge.js";

test("calendar-managed fresh products use the detailed season label", () => {
  const product = {
    name: "Soya Beans",
    category: "Tubers & Legumes",
    inSeason: false,
    seasonManaged: true,
    seasonStatus: "shoulder",
  };
  assert.equal(shouldShowSeasonBadge(product), true);
  assert.equal(getSeasonBadgeLabel(product), "Shoulder season");
});

test("unvalidated and branded products never receive seasonal badges", () => {
  assert.equal(
    shouldShowSeasonBadge({
      name: "Golden Star India Parboiled Rice",
      brand: "Golden Star",
      category: "Grains & Cereals",
      inSeason: false,
      seasonManaged: false,
      seasonStatus: "unvalidated",
    }),
    false
  );
});

test("calendar-managed farmer palm oil can reflect the commodity cycle", () => {
  const product = {
    name: "Farmer's Palm Oil",
    category: "Oil & Cooking Essentials",
    inSeason: false,
    seasonManaged: true,
    seasonStatus: "shoulder",
  };
  assert.equal(shouldShowSeasonBadge(product), true);
  assert.equal(getSeasonBadgeLabel(product), "Shoulder season");
});
