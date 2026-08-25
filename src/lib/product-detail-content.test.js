import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { normalizeProductEditorialContent } from "./product-detail-content.js";

test("normalizes only Supabase product editorial fields", () => {
  assert.deepEqual(
    normalizeProductEditorialContent({
      description: "  Database description.  ",
      handling_protocols: ["  Handle carefully. ", null, "", 42],
      storage_tips: [" Keep dry. ", "   "],
    }),
    {
      description: "Database description.",
      handlingProtocols: ["Handle carefully."],
      storageTips: ["Keep dry."],
    }
  );
});

test("does not fabricate content when Supabase fields are empty", () => {
  assert.deepEqual(normalizeProductEditorialContent({}), {
    description: "",
    handlingProtocols: [],
    storageTips: [],
  });
  assert.deepEqual(
    normalizeProductEditorialContent({ description: null, handling_protocols: null, storage_tips: "Keep cold" }),
    { description: "", handlingProtocols: [], storageTips: [] }
  );
});

test("product detail page contains no generated food handling or storage fallback", () => {
  const page = readFileSync(resolve(process.cwd(), "src/app/products/[productSlug]/page.js"), "utf8");

  assert.doesNotMatch(page, /DEFAULT_FEATURES|createProductBuyingGuide|createProductFaqItems/);
  assert.doesNotMatch(page, /Keep refrigerated or in a cool, dry place|fresh longer|cold-chain care/);
  assert.match(page, /handlingProtocols\.length/);
  assert.match(page, /storageTips\.length/);
});

test("product gallery uses arrows, image count, and dots instead of thumbnail images", () => {
  const client = readFileSync(resolve(process.cwd(), "src/components/product-detail-client.js"), "utf8");
  const badges = readFileSync(resolve(process.cwd(), "src/styles/product-badges.css"), "utf8");

  assert.match(client, /product-detail-gallery-arrow--previous/);
  assert.match(client, /product-detail-gallery-arrow--next/);
  assert.match(client, /product-detail-gallery-count/);
  assert.match(client, /product-detail-gallery-dot/);
  assert.match(client, /Show product image \$\{idx \+ 1\} of \$\{galleryImages\.length\}/);
  assert.doesNotMatch(client, /product-detail-thumb|Thumbnail \$\{idx \+ 1\}/);
  assert.match(badges, /\.product-detail-page \.product-detail-gallery-dot\.is-active/);
});

test("seasonal products show an explicit icon-led in-season or off-season status", () => {
  const detail = readFileSync(resolve(process.cwd(), "src/components/product-detail-client.js"), "utf8");
  const card = readFileSync(resolve(process.cwd(), "src/components/product-card.js"), "utf8");

  assert.match(detail, /product-detail-season__icon/);
  assert.match(detail, /isInSeason \? "In season" : "Off season"/);
  assert.match(card, /isInSeason \? "In season" : "Off season"/);
});
