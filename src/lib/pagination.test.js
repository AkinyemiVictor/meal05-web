import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPaginationItems } from "./pagination.js";

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
