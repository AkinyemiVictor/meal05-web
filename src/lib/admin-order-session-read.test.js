import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const adminData = read("src/lib/admin-dashboard-data.js");
const ordersPage = read("src/app/admin/(secure)/orders/page.js");
const dashboardPage = read("src/app/admin/(secure)/dashboard/page.js");
const secureLayout = read("src/app/admin/(secure)/layout.js");
const migration = read("supabase/migrations/20260824191411_fix_staff_rls_for_admin_order_reads.sql");

test("admin order loaders can use an authenticated request client", () => {
  assert.match(adminData, /loadOrdersMetrics\([\s\S]*client = null/);
  assert.match(adminData, /loadOrderExceptionQueue\([\s\S]*client = null/);
  assert.match(adminData, /loadOrderSupportOrderCatalogue\([\s\S]*client = null/);
  assert.match(adminData, /loadOrderAdminDetail\(orderId, \{ client = null \} = \{\}\)/);
  assert.match(adminData, /const admin = client \|\| getSupabaseAdminClient\(\)/);
});

test("admin orders use server-only reads behind the authenticated admin layout", () => {
  assert.match(secureLayout, /getSupabaseRouteClient\(await cookies\(\)\)/);
  assert.match(secureLayout, /hasAdminAccess\(\{ userId: user\.id, email: user\.email \}\)/);
  assert.doesNotMatch(ordersPage, /getSupabaseRouteClient|adminDataClient/);
  assert.match(ordersPage, /loadOrderAdminDetail\(selectedOrderId\)/);
  assert.match(ordersPage, /loadOrderSupportOrderCatalogue\(\{ page, pageSize, query, status \}\)/);
  assert.match(dashboardPage, /getSupabaseRouteClient\(await cookies\(\)\)/);
  assert.match(dashboardPage, /loadOrdersMetrics\([\s\S]*client: adminDataClient/);
});

test("admin and staff helpers resolve active Meal05 roles without JWT-role assumptions", () => {
  assert.match(migration, /create or replace function public\.is_admin\(\)/i);
  assert.match(migration, /create or replace function public\.is_staff\(\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /u\.auth_id = auth\.uid\(\) or u\.id = auth\.uid\(\)/i);
  assert.match(migration, /u\.is_active = true/i);
  assert.match(migration, /'admin', 'super_admin', 'superadmin'/i);
  assert.match(migration, /'dispatcher', 'staff', 'admin', 'super_admin', 'superadmin'/i);
  assert.match(migration, /grant execute on function public\.is_admin\(\) to authenticated/i);
  assert.match(migration, /grant execute on function public\.is_staff\(\) to authenticated/i);
});

test("recursive users/order/delivery role policies are replaced with helper calls", () => {
  assert.match(migration, /drop policy if exists "Admins can view and update all users" on public\.users/i);
  assert.match(migration, /create policy "Admins can view and update all users"[\s\S]*using \(public\.is_admin\(\)\)[\s\S]*with check \(public\.is_admin\(\)\)/i);
  assert.match(migration, /drop policy if exists "Admins can view and manage all orders" on public\.orders/i);
  assert.match(migration, /create policy "Admins can view and manage all orders"[\s\S]*using \(public\.is_admin\(\)\)[\s\S]*with check \(public\.is_admin\(\)\)/i);
  assert.match(migration, /drop policy if exists "Staff can update delivery status" on public\.deliveries/i);
  assert.match(migration, /create policy "Staff can update delivery status"[\s\S]*using \(public\.is_staff\(\)\)[\s\S]*with check \(public\.is_staff\(\)\)/i);
});
