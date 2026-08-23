import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const detailSource = readFileSync(
  resolve(process.cwd(), "src/app/availability-requests/[id]/request-detail-client.js"),
  "utf8"
);
const newRequestSource = readFileSync(
  resolve(process.cwd(), "src/app/availability-requests/new/request-client.js"),
  "utf8"
);
const accountSource = readFileSync(
  resolve(process.cwd(), "src/app/account/availability-requests/page.js"),
  "utf8"
);

test("request detail uses customer lifecycle presentation and progress stages", () => {
  assert.match(detailSource, /getAvailabilityRequestPresentation/);
  assert.match(detailSource, /Availability request progress/);
  assert.match(detailSource, /Item status/);
  assert.match(detailSource, /Continue to payment/);
  assert.match(detailSource, /Return eligible items to cart/);
  assert.doesNotMatch(detailSource, /record\.status\.replaceAll/);
});

test("active request detail refreshes while customer is away or waiting", () => {
  assert.match(detailSource, /isAvailabilityRequestLive/);
  assert.match(detailSource, /setInterval\(refresh, 30000\)/);
  assert.match(detailSource, /visibilitychange/);
  assert.match(detailSource, /Status refreshed/);
});

test("new request screen explains the three-stage journey and no-charge submission", () => {
  assert.match(newRequestSource, /AvailabilityRequestNotice/);
  assert.match(newRequestSource, /Submit basket/);
  assert.match(newRequestSource, /We check requested items/);
  assert.match(newRequestSource, /Return when it’s ready/);
  assert.match(newRequestSource, /Submitting this request does not charge you/);
  assert.doesNotMatch(newRequestSource, /2 business hours/);
  assert.doesNotMatch(newRequestSource, /2 hours to create the order/);
});

test("account request list uses customer statuses and refreshes live requests", () => {
  assert.match(accountSource, /getAvailabilityRequestPresentation/);
  assert.match(accountSource, /isAvailabilityRequestLive/);
  assert.match(accountSource, /setInterval\(refresh, 30000\)/);
  assert.match(accountSource, /still checking/);
  assert.doesNotMatch(accountSource, /request\.status\.replaceAll/);
});
