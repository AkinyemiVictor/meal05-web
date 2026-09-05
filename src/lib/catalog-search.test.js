import assert from "node:assert/strict";
import test from "node:test";

import { applyCatalogSearchTerms, getCatalogSearchTerms } from "./catalog-search.js";

test("catalog search treats separated words as independent required terms", () => {
  assert.deepEqual(getCatalogSearchTerms("Golden Penny Jollof"), ["golden", "penny", "jollof"]);

  const filters = [];
  const query = {
    ilike(column, pattern) {
      filters.push([column, pattern]);
      return this;
    },
  };

  assert.equal(applyCatalogSearchTerms(query, "Golden Penny Jollof"), query);
  assert.deepEqual(filters, [
    ["search_text", "%golden%"],
    ["search_text", "%penny%"],
    ["search_text", "%jollof%"],
  ]);
});

test("catalog search normalizes punctuation and removes duplicate terms", () => {
  assert.deepEqual(getCatalogSearchTerms("  King's_oil, KING'S oil  "), ["king's", "oil"]);
});

test("catalog search keeps useful partial words", () => {
  assert.deepEqual(getCatalogSearchTerms("golden penny spag"), ["golden", "penny", "spag"]);
});
