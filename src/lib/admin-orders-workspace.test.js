import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const page = read("src/app/admin/(secure)/orders/page.js");
const control = read("src/components/admin-order-status-control.js");
const riders = read("src/lib/delivery/riders.js");

test("orders page is one queue/detail workspace without the duplicate exception queue", () => {
  assert.match(page, /Order queue/);
  assert.match(page, /Choose an order/);
  assert.doesNotMatch(page, /loadOrderExceptionQueue|Order Exception Queue/);
  assert.equal((page.match(/<AdminOrderStatusControl/g) || []).length, 1);
});

test("order lifecycle presents one guided next action and routes payment review to Payments", () => {
  assert.match(control, /Next action/);
  assert.match(control, /Start processing/);
  assert.match(control, /Mark ready for dispatch/);
  assert.match(control, /Mark dispatched/);
  assert.match(control, /Mark delivered/);
  assert.match(control, /admin\/payments\?purpose=order_payment&orderId=/);
  assert.doesNotMatch(control, /<select/);
});

test("orders rider lookup skips unused signed photo fan-out", () => {
  assert.match(page, /loadRiderDirectory\(\{ activeOnly: true, includePhotos: false \}\)/);
  assert.match(riders, /includePhotos = true/);
});
