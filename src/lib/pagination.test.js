import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPaginatedHref, buildPaginationItems, readPageFromSearch } from "./pagination.js";

test("renders every page when the page count is already compact", () => {
  assert.deepEqual(buildPaginationItems(3, 5), [1, 2, 3, 4, 5]);
});

test("keeps a moving window around a middle page with ellipses at either side", () => {
  assert.deepEqual(buildPaginationItems(15, 40), ["ellipsis-start", 13, 14, 15, 16, 17, "ellipsis-end"]);
});

test("keeps the first and final windows anchored at the edges", () => {
  assert.deepEqual(buildPaginationItems(1, 20), [1, 2, 3, 4, 5, "ellipsis-end"]);
  assert.deepEqual(buildPaginationItems(20, 20), ["ellipsis-start", 16, 17, 18, 19, 20]);
});

test("reads a valid page from the URL and falls back for invalid values", () => {
  assert.equal(readPageFromSearch("?page=4"), 4);
  assert.equal(readPageFromSearch("?page=0"), 1);
  assert.equal(readPageFromSearch("?page=not-a-number"), 1);
});

test("builds pagination URLs without dropping other query parameters", () => {
  assert.equal(
    buildPaginatedHref({ pathname: "/shop", search: "?sort=price", hash: "products", page: 3 }),
    "/shop?sort=price&page=3#products"
  );
  assert.equal(
    buildPaginatedHref({ pathname: "/shop", search: "?sort=price&page=3", page: 1 }),
    "/shop?sort=price"
  );
});
