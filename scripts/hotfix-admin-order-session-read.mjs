import fs from "node:fs";

const dataPath = "src/lib/admin-dashboard-data.js";
const ordersPagePath = "src/app/admin/(secure)/orders/page.js";
const dashboardPagePath = "src/app/admin/(secure)/dashboard/page.js";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, content) => fs.writeFileSync(path, content);

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count === 0) {
    if (source.includes(after)) return source;
    throw new Error(`Missing transform target: ${label}`);
  }
  if (count !== 1) throw new Error(`Expected one transform target for ${label}, found ${count}`);
  return source.replace(before, after);
};

let data = read(dataPath);

data = replaceOnce(
  data,
  'export async function loadOrdersMetrics({ status = "all", paymentStatus = "all", page = 1, pageSize = 25 } = {}) {\n  const admin = getSupabaseAdminClient();',
  'export async function loadOrdersMetrics({ status = "all", paymentStatus = "all", page = 1, pageSize = 25, client = null } = {}) {\n  const admin = client || getSupabaseAdminClient();',
  "orders metrics authenticated client"
);

data = replaceOnce(
  data,
  'export async function loadOrderExceptionQueue({ category = "all", page = 1, pageSize = 15 } = {}) {\n  const admin = getSupabaseAdminClient();',
  'export async function loadOrderExceptionQueue({ category = "all", page = 1, pageSize = 15, client = null } = {}) {\n  const admin = client || getSupabaseAdminClient();',
  "order exception authenticated client"
);

data = replaceOnce(
  data,
  '  deliveryStatus = "all",\n} = {}) {\n  const admin = getSupabaseAdminClient();\n  const warnings = createWarnings();',
  '  deliveryStatus = "all",\n  client = null,\n} = {}) {\n  const admin = client || getSupabaseAdminClient();\n  const warnings = createWarnings();',
  "order catalogue authenticated client"
);

data = replaceOnce(
  data,
  'export async function loadOrderAdminDetail(orderId) {\n  const admin = getSupabaseAdminClient();',
  'export async function loadOrderAdminDetail(orderId, { client = null } = {}) {\n  const admin = client || getSupabaseAdminClient();',
  "order detail authenticated client"
);

write(dataPath, data);

let ordersPage = read(ordersPagePath);
ordersPage = replaceOnce(
  ordersPage,
  'import Link from "next/link";\n',
  'import Link from "next/link";\nimport { cookies } from "next/headers";\n',
  "orders page cookies import"
);
ordersPage = replaceOnce(
  ordersPage,
  'import { loadOrderDeliveryAssignment, loadRiderDirectory } from "@/lib/delivery/riders";\n',
  'import { loadOrderDeliveryAssignment, loadRiderDirectory } from "@/lib/delivery/riders";\nimport { getSupabaseRouteClient } from "@/lib/supabase/route-client";\n',
  "orders page route client import"
);
ordersPage = replaceOnce(
  ordersPage,
  'export default async function AdminOrdersPage({ searchParams }) {\n  const params = (await searchParams) || {};\n',
  'export default async function AdminOrdersPage({ searchParams }) {\n  const adminDataClient = getSupabaseRouteClient(await cookies());\n  const params = (await searchParams) || {};\n',
  "orders page authenticated client"
);
ordersPage = replaceOnce(
  ordersPage,
  '      deliveryStatus,\n    }),\n    selectedOrderId ? loadOrderAdminDetail(selectedOrderId) : Promise.resolve({ order: null, items: [], supportCases: [], warnings: [] }),\n    loadOrderExceptionQueue({ category: exception, page: exceptionPage, pageSize: 12 }),\n',
  '      deliveryStatus,\n      client: adminDataClient,\n    }),\n    selectedOrderId ? loadOrderAdminDetail(selectedOrderId, { client: adminDataClient }) : Promise.resolve({ order: null, items: [], supportCases: [], warnings: [] }),\n    loadOrderExceptionQueue({ category: exception, page: exceptionPage, pageSize: 12, client: adminDataClient }),\n',
  "orders page authenticated reads"
);
write(ordersPagePath, ordersPage);

let dashboardPage = read(dashboardPagePath);
dashboardPage = replaceOnce(
  dashboardPage,
  'import Link from "next/link";\n',
  'import Link from "next/link";\nimport { cookies } from "next/headers";\n',
  "dashboard cookies import"
);
dashboardPage = replaceOnce(
  dashboardPage,
  'import { adminFormatters, loadOrdersMetrics, loadOverviewMetrics } from "@/lib/admin-dashboard-data";\n',
  'import { adminFormatters, loadOrdersMetrics, loadOverviewMetrics } from "@/lib/admin-dashboard-data";\nimport { getSupabaseRouteClient } from "@/lib/supabase/route-client";\n',
  "dashboard route client import"
);
dashboardPage = replaceOnce(
  dashboardPage,
  'export default async function AdminDashboardPage() {\n  const overview = await loadOverviewMetrics();\n  const recentOrders = await loadOrdersMetrics({ status: "all", paymentStatus: "all", page: 1, pageSize: 12 });\n',
  'export default async function AdminDashboardPage() {\n  const adminDataClient = getSupabaseRouteClient(await cookies());\n  const overview = await loadOverviewMetrics();\n  const recentOrders = await loadOrdersMetrics({ status: "all", paymentStatus: "all", page: 1, pageSize: 12, client: adminDataClient });\n',
  "dashboard authenticated order reads"
);
write(dashboardPagePath, dashboardPage);

console.log("Admin order authenticated-session read hotfix applied.");
