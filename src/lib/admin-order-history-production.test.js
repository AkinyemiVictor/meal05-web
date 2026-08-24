import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const adminData = read("src/lib/admin-dashboard-data.js");
const adminOrdersPage = read("src/app/admin/(secure)/orders/page.js");

test("admin order list queries the live order schema before legacy fallbacks", () => {
  const marker = "const ORDER_SELECT_CANDIDATES = [";
  const start = adminData.indexOf(marker);
  assert.notEqual(start, -1);
  const firstBlock = adminData.slice(start, start + 500);
  assert.match(firstBlock, /payment_method, payment_reference, delivery_status, delivery_address, created_at, updated_at/);
  const canonicalLine = firstBlock.split("\n").find((line) => line.includes("payment_method"));
  assert.ok(canonicalLine);
  assert.doesNotMatch(canonicalLine, /authentication_method|auth_method/);
});

test("admin order detail reads live item price and fulfilment preference", () => {
  assert.match(adminData, /quantity, price, size_preference, fulfillment_note/);
  assert.match(adminData, /row\?\.unit_price \?\? row\?\.price/);
  assert.match(adminData, /sizePreferenceLabel/);
  assert.match(adminData, /larger: "Larger pieces"/);
});

test("admin order detail visibly renders fulfilment size preference", () => {
  assert.match(adminOrdersPage, /Fulfilment size preference:/);
  assert.match(adminOrdersPage, /item\.sizePreferenceLabel/);
});
