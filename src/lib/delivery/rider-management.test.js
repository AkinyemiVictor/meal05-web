import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("rider directory writes are admin-only and photos stay in private storage", () => {
  const route = read("../../app/api/admin/riders/save/route.js");
  const migration = read("../../../supabase/migrations/20260815105703_rider_directory_and_manifests.sql");
  assert.match(route, /requireAdminApiUser/);
  assert.match(route, /MAX_PHOTO_BYTES/);
  assert.match(route, /normalizePhoneContact/);
  assert.match(migration, /'rider-photos'[\s\S]*false/);
  assert.match(migration, /revoke all on table public\.delivery_partners from anon, authenticated/);
});

test("route assignment records physical package counts atomically", () => {
  const management = read("./management.js");
  const migration = read("../../../supabase/migrations/20260815105703_rider_directory_and_manifests.sql");
  assert.match(management, /create_delivery_route_with_packages_transaction/);
  assert.match(migration, /package_count integer not null default 1/);
  assert.match(migration, /package count must be between 1 and 50/);
});

test("print manifest contains delivery-only fields and a paper privacy notice", () => {
  const page = read("../../app/admin/(secure)/delivery/routes/[routeId]/manifest/page.js");
  const loader = read("./riders.js");
  assert.match(page, /Customer/);
  assert.match(page, /Phone/);
  assert.match(page, /Delivery address/);
  assert.match(page, /destroy it securely/);
  assert.doesNotMatch(loader, /payment_reference|contact_email|government_id|guarantor/);
});
