import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const picker = read("src/components/size-preference-picker.js");
const notice = read("src/components/availability-request-notice.js");
const productDetail = read("src/components/product-detail-client.js");
const quickAdd = read("src/components/quick-add-drawer.js");
const productCard = read("src/components/product-card.js");
const flexibleStyles = read("src/styles/flexible-availability.css");

test("shared preferred-size picker is a compact, readable product option", () => {
  assert.match(picker, /Piece size preference/);
  assert.match(picker, /Best available/);
  assert.match(picker, /Small/);
  assert.match(picker, /Medium/);
  assert.match(picker, /Large/);
  assert.match(picker, /We’ll try to match your preference/);
  assert.match(picker, /How this works/);
  assert.match(picker, /Your selected quantity or weight stays the same/);
  assert.match(picker, /size-preference-picker__label/);
  assert.match(flexibleStyles, /\.size-preference-picker__label\s*\{[^}]*text-align:\s*center/s);
  assert.doesNotMatch(picker, /Recommended|size-preference-picker__indicator/);
});

test("product cards reserve two title lines before rendering the price", () => {
  assert.match(productCard, /min-h-10 max-h-10 text-\[14px\] leading-5/);
  assert.match(productCard, /min-h-12 max-h-12 text-base leading-6/);
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
