import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("location picker secures an exact pin without advertising or enforcing a launch radius", () => {
  const picker = read("src/components/location-picker.js");

  assert.match(picker, /Secure location/);
  assert.match(picker, /Location secured/);
  assert.match(picker, /Exact delivery pin/);
  assert.doesNotMatch(picker, /5 km launch zone|Checking coverage|Confirm this location|delivery-area waitlist/i);
});

test("delivery zone resolver provides an unrestricted fallback outside precise zones", () => {
  const migration = read("supabase/migrations/20260831184923_remove_launch_radius_limit.sql");

  assert.match(migration, /zone_type\s*=\s*'unrestricted'/i);
  assert.match(migration, /z\.zone_type\s*=\s*'unrestricted'[\s\S]*or\s*\([\s\S]*z\.zone_type\s*=\s*'radius'/i);
  assert.match(migration, /case when z\.zone_type = 'unrestricted' then 1 else 0 end/i);
  assert.match(migration, /radius_m\s*=\s*null/i);
});

test("checkout copy no longer rejects customers as outside the launch area", () => {
  const checkout = read("src/components/checkout-summary.js");
  const policy = read("src/app/delivery-policy/page.js");
  const orders = read("src/app/api/orders/route.js");

  assert.doesNotMatch(checkout, /Akala Express Launch Zone|5 km launch zone/i);
  assert.doesNotMatch(policy, /Akala Express Launch Zone|launch radius/i);
  assert.doesNotMatch(orders, /outside our current delivery area|join the waitlist/i);
});
