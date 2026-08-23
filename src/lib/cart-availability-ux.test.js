import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const cartSource = readFileSync(resolve(process.cwd(), "src/app/cart/page.js"), "utf8");
const availabilitySource = readFileSync(
  resolve(process.cwd(), "src/components/cart-availability-ux.js"),
  "utf8"
);

test("cart distinguishes ready items from items needing confirmation", () => {
  assert.match(cartSource, /CartLineAvailabilityBadge requestOnly=\{requestOnly\}/);
  assert.match(availabilitySource, /Ready to order/);
  assert.match(availabilitySource, /Needs confirmation/);
  assert.match(cartSource, /requestLineCount/);
  assert.match(cartSource, /standardLineCount/);
});

test("mixed request basket explains the launch flow without a hard-coded SLA", () => {
  assert.match(cartSource, /CartAvailabilitySummary/);
  assert.match(availabilitySource, /submits the full basket together/);
  assert.match(availabilitySource, /No payment is taken now/);
  assert.match(availabilitySource, /do not need to keep this page open/);
  assert.doesNotMatch(cartSource, /confirm it within 2 business hours/);
  assert.doesNotMatch(availabilitySource, /2 business hours/);
  assert.match(cartSource, /Check basket availability/);
});

test("cart request and supplier items do not use local stock as a checkout blocker", () => {
  assert.match(cartSource, /const bypassLocalStock = requestOnly \|\| !usesTrackedInventory\(item\)/);
  assert.match(cartSource, /!bypassLocalStock && \(normalised\.includes\("out"\)/);
  assert.match(cartSource, /effectiveMaxQuantity = !bypassLocalStock && Number\.isFinite\(availableCount\)/);
});

test("cart keeps flexible size language aligned with the preferred-size model", () => {
  assert.match(cartSource, /<span>Preferred size<\/span>/);
  assert.doesNotMatch(cartSource, /<span>Physical size preference<\/span>/);
});
