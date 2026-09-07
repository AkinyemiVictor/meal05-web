import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { getFirstOrderDeliveryPricing } from "./delivery-settings.js";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("location picker explains distance-band pricing and offers pickup beyond the extended area", () => {
  const picker = read("src/components/location-picker.js");

  assert.match(picker, /Secure location/);
  assert.match(picker, /Location secured/);
  assert.match(picker, /Exact delivery pin/);
  assert.match(picker, /delivery fee will be shown at checkout/i);
  assert.match(picker, /outside our current extended-delivery area[\s\S]*pickup at checkout/i);
});

test("delivery zone resolver uses three priced radius bands and no unrestricted fallback", () => {
  const migration = read("supabase/migrations/20260907090000_launch_delivery_distance_bands.sql");

  assert.match(migration, /Meal05 Core \(0-5 km\)'[\s\S]*1500[\s\S]*5000[\s\S]*priority/i);
  assert.match(migration, /Meal05 Extended \(5-10 km\)'[\s\S]*2500[\s\S]*10000/i);
  assert.match(migration, /Meal05 Extended Plus \(10-20 km\)'[\s\S]*3500[\s\S]*20000/i);
  assert.match(migration, /z\.zone_type = 'radius'/i);
  assert.doesNotMatch(migration, /z\.zone_type\s*=\s*'unrestricted'/i);
});

test("checkout and policy explain distance pricing plus official pickup", () => {
  const checkout = read("src/components/checkout-summary.js");
  const policy = read("src/app/delivery-policy/page.js");
  const form = read("src/components/checkout-form.js");
  const fulfillment = read("src/app/api/fulfillment/options/route.js");

  assert.match(checkout, /core zone covers the[\s\S]*first 5 km/i);
  assert.match(policy, /Extended Plus zone:[\s\S]*20 km/i);
  assert.match(policy, /not a pickup station unless Meal05 deliberately lists it/i);
  assert.match(form, /Delivery fee for this address/);
  assert.match(form, /Choose a pickup station/);
  assert.match(fulfillment, /distanceKm[\s\S]*summary/);
});

test("the Oloyin one-cup option is retired without deleting historical variant links", () => {
  const migration = read("supabase/migrations/20260907090000_launch_delivery_distance_bands.sql");

  assert.match(migration, /lower\(p\.name\) = 'honey beans \(oloyin\)'/i);
  assert.match(migration, /lower\(coalesce\(pv\.name, ''\)\) = '1 cup \(150g\)'/i);
  assert.match(migration, /set is_active = false/i);
  assert.doesNotMatch(migration, /delete from public\.product_variants/i);
});

test("the first-order credit covers the core fee but preserves extended-zone surcharges", () => {
  assert.deepEqual(getFirstOrderDeliveryPricing(1500, true), {
    quotedFee: 1500,
    credit: 1500,
    customerFee: 0,
  });
  assert.deepEqual(getFirstOrderDeliveryPricing(3500, true), {
    quotedFee: 3500,
    credit: 1500,
    customerFee: 2000,
  });
  assert.equal(getFirstOrderDeliveryPricing(2500, false).customerFee, 2500);
});
