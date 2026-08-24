import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const adminData = read("src/lib/admin-dashboard-data.js");
const ordersPage = read("src/app/admin/(secure)/orders/page.js");
const dashboardPage = read("src/app/admin/(secure)/dashboard/page.js");
const migration = read("supabase/migrations/20260824194500_fix_staff_rls_for_admin_order_reads.sql");

test("admin order loaders can use an authenticated request client", () => {
  assert.match(adminData, /loadOrdersMetrics\([\s\S]*client = null/);
  assert.match(adminData, /loadOrderExceptionQueue\([\s\S]*client = null/);
  assert.match(adminData, /loadOrderSupportOrderCatalogue\([\s\S]*client = null/);
  assert.match(adminData, /loadOrderAdminDetail\(orderId, \{ client = null \} = \{\}\)/);
  assert.match(adminData, /const admin = client \|\| getSupabaseAdminClient\(\)/);
});

test("admin orders and dashboard pass the logged-in Supabase session to order reads", () => {
  assert.match(ordersPage, /getSupabaseRouteClient\(await cookies\(\)\)/);
  assert.match(ordersPage, /client: adminDataClient/);
  assert.match(ordersPage, /loadOrderAdminDetail\(selectedOrderId, \{ client: adminDataClient \}\)/);
  assert.match(dashboardPage, /getSupabaseRouteClient\(await cookies\(\)\)/);
  assert.match(dashboardPage, /loadOrdersMetrics\([\s\S]*client: adminDataClient/);
});

test("is_staff resolves active Meal05 workspace roles from public.users", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /u\.auth_id = auth\.uid\(\) or u\.id = auth\.uid\(\)/i);
  assert.match(migration, /u\.is_active = true/i);
  assert.match(migration, /'dispatcher', 'staff', 'admin', 'super_admin', 'superadmin'/i);
  assert.match(migration, /grant execute on function public\.is_staff\(\) to authenticated/i);
});
