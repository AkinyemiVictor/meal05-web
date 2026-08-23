import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const picker = read("src/components/size-preference-picker.js");
const notice = read("src/components/availability-request-notice.js");
const productDetail = read("src/components/product-detail-client.js");
const quickAdd = read("src/components/quick-add-drawer.js");

test("shared preferred-size picker presents preference as non-priced fulfilment guidance", () => {
  assert.match(picker, /Preferred size/);
  assert.match(picker, /Best available/);
  assert.match(picker, /Recommended/);
  assert.match(picker, /Smaller/);
  assert.match(picker, /Medium/);
  assert.match(picker, /Larger/);
  assert.match(picker, /does not change the price, quantity, or value you pay for/);
  assert.match(picker, /closest suitable size/);
});

test("product detail and quick add share the same flexible preference control", () => {
  assert.match(productDetail, /<SizePreferencePicker/);
  assert.match(quickAdd, /<SizePreferencePicker/);
  assert.doesNotMatch(productDetail, /Physical size preference/);
  assert.doesNotMatch(quickAdd, /Physical size preference/);
});

test("request notice uses configured SLA and asynchronous return messaging", () => {
  assert.match(notice, /fetch\("\/api\/availability-settings"\)/);
  assert.match(notice, /formatAvailabilityDuration\(timing\.confirmationSlaMinutes\)/);
  assert.match(notice, /Usually confirmed within 15–45 minutes/);
  assert.match(notice, /No payment is taken yet/);
  assert.match(notice, /You don’t need to wait on this page/);
  assert.match(notice, /we’ll notify you/);
  assert.doesNotMatch(notice, /2 business hours/);
});

test("request-only product surfaces use the shared configured notice", () => {
  assert.match(productDetail, /availabilityMode === "request" \? <AvailabilityRequestNotice \/>/);
  assert.match(quickAdd, /availabilityMode === "request" \? <AvailabilityRequestNotice compact \/>/);
});
