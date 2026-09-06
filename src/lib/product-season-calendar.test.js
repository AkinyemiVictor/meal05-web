import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260906185305_finalize_product_season_calendar.sql");
const adminData = read("src/lib/admin-dashboard-data.js");
const adminPage = read("src/app/admin/(secure)/catalogue/page.js");
const adminControl = read("src/components/admin-product-management-control.js");
const updateRoute = read("src/app/api/admin/products/update/route.js");

test("season calendar is reproducible, constrained, and uses Lagos time", () => {
  assert.match(migration, /create table if not exists public\.product_season_profiles/);
  assert.match(migration, /product_season_profiles_month_values_check/);
  assert.match(migration, /product_season_profiles_month_sets_check/);
  assert.match(migration, /create or replace view public\.product_season_calendar/);
  assert.match(migration, /timezone\('Africa\/Lagos', now\(\)\)/);
  assert.match(migration, /'Plantain - Small'/);
});

test("season automation is server-only and conservative for unvalidated products", () => {
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /not exists \([\s\S]*?public\.product_season_profiles/);
  assert.match(migration, /set in_season = false/);
  assert.match(migration, /revoke all on table public\.product_season_profiles from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.refresh_product_season_flags\(\) from public, anon, authenticated/);
  assert.match(migration, /refresh_meal05_product_seasons/);
  assert.match(migration, /'10 0 \* \* \*'/);
});

test("admin catalogue explains five-state calendar status without allowing temporary flag edits", () => {
  assert.match(adminData, /from\("product_current_season"\)/);
  assert.match(adminData, /supplierCheckProducts: statusCounts\.shoulder \+ statusCounts\.out/);
  assert.match(adminPage, /Peak season/);
  assert.match(adminPage, /Shoulder season/);
  assert.match(adminPage, /Year-round/);
  assert.match(adminPage, /seasonManaged=\{row\.seasonManaged\}/);
  assert.match(adminControl, /disabled=\{disabled \|\| seasonManaged\}/);
  assert.match(updateRoute, /This product is calendar-managed/);
});
