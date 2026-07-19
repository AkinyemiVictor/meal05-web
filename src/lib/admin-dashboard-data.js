import "server-only";

import {
  getAdminRoleLabel,
  getAdminRoleRank,
  matchesAdminStaffFilter,
  normalizeAdminRole,
  normalizeAdminStaffFilter,
} from "@/lib/admin-roles";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import {
  DEFAULT_BANNER_PLACEMENT,
  HERO_BANNER_BUCKET,
  buildMobileCandidates,
  createBannerSearchText,
  getBannerStatus,
  inferMobileImage,
  normalizeBannerPlacement,
  normalizeBannerRecord,
  sortBanners,
} from "@/lib/banners";
import { loadDeliverySettingsAdminData as loadDeliverySettingsAdminDataBase } from "@/lib/delivery-settings-server";
import { getInventoryLossTypeLabel, normalizeInventoryLossType } from "@/lib/inventory-loss";
import {
  getOrderSupportCaseStatusLabel,
  getOrderSupportCaseTypeLabel,
  normalizeOrderSupportCaseStatus,
  normalizeOrderSupportCaseType,
} from "@/lib/order-support";
import {
  matchesProductMerchandisingFilter,
  normalizeProductMerchandisingFilter,
  normalizeProductMerchandisingRecord,
  PRODUCT_MERCHANDISING_SELECT_FIELDS,
} from "@/lib/product-merchandising";
import {
  getProductDataQualityIssueLabel,
  matchesProductDataQualityFilter,
  normalizeProductDataQualityFilter,
  PRODUCT_DATA_QUALITY_ISSUES,
} from "@/lib/product-data-quality";
import { getProductPromoState, normalizePromoEnabled, normalizePromoText, parsePromoExpiry } from "@/lib/product-promo";
import { normalizePromoCodeRecord } from "@/lib/promo-codes";
import { normalizePurchaseMode } from "@/lib/purchase-quantities";
import {
  calculateRestockOrderByDate,
  getRestockPlanningMissingFields,
  getRestockScheduleState,
  matchesSupplierRestockFilter,
  normalizeSupplierRestockFilter,
} from "@/lib/supplier-restock-planning";

const CURRENCY = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const sumBy = (rows, key) =>
  (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + toNumber(row?.[key]), 0);

const uniqueStrings = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

const chunk = (list, size = 500) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
};

const daysAgoIso = (days) => new Date(Date.now() - Number(days || 0) * 24 * 60 * 60 * 1000).toISOString();

const startOfTodayIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const isUnknownColumnError = (message) => {
  const text = String(message || "");
  return (
    /schema cache/i.test(text) ||
    /column .* does not exist/i.test(text) ||
    /could not find the .* column/i.test(text) ||
    /relation .* does not exist/i.test(text)
  );
};

const parseAvailableStock = (row) => {
  if (!row || typeof row !== "object") return null;
  if (row.stock_count != null && Number.isFinite(Number(row.stock_count))) {
    return Math.max(0, Number(row.stock_count));
  }
  return null;
};

const readMethod = (row) =>
  String(row?.payment_method || row?.authentication_method || row?.auth_method || "unknown").trim().toLowerCase() || "unknown";

const MANUAL_PAYMENT_METHODS = new Set([
  "cash",
  "cash_on_delivery",
  "cash on delivery",
  "cod",
  "cash_on_pickup",
  "cash on pickup",
  "cop",
  "pay_on_delivery",
  "pay on delivery",
  "pos",
]);

const isManualPaymentMethod = (method) => MANUAL_PAYMENT_METHODS.has(String(method || "").trim().toLowerCase());

const statusTone = (value) => {
  const status = String(value || "").toLowerCase();
  if (status === "paid" || status === "delivered" || status === "completed") return { bg: "#dcfce7", fg: "#166534" };
  if (status === "pending" || status === "processing" || status === "shipped") return { bg: "#fef9c3", fg: "#854d0e" };
  if (status === "failed" || status === "cancelled" || status === "stock_failed") return { bg: "#fee2e2", fg: "#991b1b" };
  return { bg: "#e5e7eb", fg: "#374151" };
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
};

const createWarnings = () => [];

const parseSelectFields = (select) =>
  String(select || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const firstNonEmptyText = (...values) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
};

const firstDefinedValue = (...values) => {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
};

const hasNonEmptyText = (value) => String(value || "").trim().length > 0;

const hasAnyPopulatedField = (row, fields = []) =>
  fields.some((field) => hasNonEmptyText(row?.[field]));

const toFiniteNumberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const selectRowsWithFallback = async (admin, table, selectCandidates, { start = 0, end = 4999 } = {}) => {
  let rows = [];
  let matchedSelect = null;
  let error = null;

  for (const select of selectCandidates) {
    const result = await admin.from(table).select(select).range(start, end);
    if (!result.error) {
      rows = Array.isArray(result.data) ? result.data : [];
      matchedSelect = select;
      error = null;
      break;
    }
    error = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }

  return { rows, matchedSelect, error };
};

const createProductDataQualityIssueCounts = () =>
  Object.fromEntries(PRODUCT_DATA_QUALITY_ISSUES.map((issue) => [issue.value, 0]));

const USER_LOOKUP_SELECTS = [
  "id, user_id, auth_id, email, phone, first_name, last_name, name",
  "id, user_id, auth_id, email, phone, name",
  "id, user_id, auth_id, email, name",
  "id, user_id, auth_id, email",
];

const PROFILE_LOOKUP_SELECTS = [
  "id, user_id, auth_id, email, phone, first_name, last_name, name",
  "id, user_id, auth_id, email, phone, name",
  "id, user_id, auth_id, email, name",
  "id, user_id, auth_id, email",
];

const fetchLookupRows = async (admin, table, ids, selectCandidates, idColumn) => {
  for (const select of selectCandidates) {
    try {
      const result = await admin.from(table).select(select).in(idColumn, ids);
      if (!result.error) {
        return { rows: Array.isArray(result.data) ? result.data : [], error: null };
      }
      if (!isUnknownColumnError(result.error?.message)) {
        return { rows: [], error: result.error };
      }
    } catch (error) {
      return { rows: [], error };
    }
  }
  return { rows: [], error: null };
};

const buildUserLabel = (row, fallbackId) => {
  const id = String(row?.id || row?.user_id || row?.auth_id || fallbackId || "").trim();
  return id ? `User ${id.slice(0, 8)}...` : "User";
};

const loadUserLookup = async (admin, userIds = []) => {
  const ids = uniqueStrings(userIds);
  const lookup = new Map();
  if (!ids.length) return lookup;

  const addRows = (rows, keyFields = []) => {
    (rows || []).forEach((row) => {
      for (const keyField of keyFields) {
        const key = String(row?.[keyField] || "").trim();
        if (!key) continue;
        if (!lookup.has(key)) {
          lookup.set(key, buildUserLabel(row, key));
        }
      }
    });
  };

  const userPasses = [
    { table: "users", idField: "id" },
    { table: "users", idField: "user_id" },
  ];
  for (const pass of userPasses) {
    const missing = ids.filter((id) => !lookup.has(id));
    if (!missing.length) break;
    const { rows } = await fetchLookupRows(admin, pass.table, missing, USER_LOOKUP_SELECTS, pass.idField);
    addRows(rows, [pass.idField, "id", "user_id", "auth_id"]);
  }

  const profilePasses = [
    { table: "profiles", idField: "id" },
    { table: "profiles", idField: "user_id" },
    { table: "profiles", idField: "auth_id" },
  ];
  for (const pass of profilePasses) {
    const missing = ids.filter((id) => !lookup.has(id));
    if (!missing.length) break;
    const { rows } = await fetchLookupRows(admin, pass.table, missing, PROFILE_LOOKUP_SELECTS, pass.idField);
    addRows(rows, [pass.idField, "id", "user_id", "auth_id"]);
  }

  return lookup;
};

export async function loadOverviewMetrics() {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();

  const since7d = daysAgoIso(7);
  const since30d = daysAgoIso(30);
  const todayStart = startOfTodayIso();

  const [
    totalOrdersRes,
    todayOrdersRes,
    pendingOrdersRes,
    paidNotDeliveredRes,
    cancelledOrdersRes,
    failedPaymentsRes,
    paidOrders7dRes,
    paidOrders30dRes,
    paidTotalsTodayRes,
    paidTotals7dRes,
    cartItemsRes,
  ] = await Promise.all([
    admin.from("orders").select("id", { head: true, count: "exact" }),
    admin.from("orders").select("id", { head: true, count: "exact" }).gte("created_at", todayStart),
    admin.from("orders").select("id", { head: true, count: "exact" }).in("status", ["pending", "processing"]),
    admin.from("orders").select("id", { head: true, count: "exact" }).eq("payment_status", "paid").not("status", "in", "(delivered)"),
    admin.from("orders").select("id", { head: true, count: "exact" }).eq("status", "cancelled"),
    admin.from("orders").select("id", { head: true, count: "exact" }).eq("payment_status", "failed"),
    admin.from("orders").select("id", { head: true, count: "exact" }).eq("payment_status", "paid").gte("created_at", since7d),
    admin.from("orders").select("id", { head: true, count: "exact" }).eq("payment_status", "paid").gte("created_at", since30d),
    admin.from("orders").select("total").eq("payment_status", "paid").gte("created_at", todayStart).range(0, 4999),
    admin.from("orders").select("total").eq("payment_status", "paid").gte("created_at", since7d).range(0, 4999),
    admin.from("cart_items").select("id", { head: true, count: "exact" }),
  ]);

  let paidTotals30dRes;
  try {
    paidTotals30dRes = await admin.from("orders").select("total").eq("payment_status", "paid").gte("created_at", since30d).range(0, 4999);
  } catch (error) {
    paidTotals30dRes = { data: [], error };
    warnings.push(`Revenue 30d unavailable: ${error?.message || String(error)}`);
  }

  [
    ["Total orders", totalOrdersRes],
    ["Today orders", todayOrdersRes],
    ["Pending orders", pendingOrdersRes],
    ["Paid not delivered", paidNotDeliveredRes],
    ["Cancelled orders", cancelledOrdersRes],
    ["Failed payments", failedPaymentsRes],
    ["Paid orders 7d", paidOrders7dRes],
    ["Paid orders 30d", paidOrders30dRes],
    ["Revenue today", paidTotalsTodayRes],
    ["Revenue 7d", paidTotals7dRes],
    ["Revenue 30d", paidTotals30dRes],
    ["Cart items", cartItemsRes],
  ].forEach(([name, result]) => {
    if (result?.error) warnings.push(`${name} unavailable: ${result.error.message}`);
  });

  const paidRevenueToday = sumBy(paidTotalsTodayRes?.data, "total");
  const paidRevenue7d = sumBy(paidTotals7dRes?.data, "total");
  const paidRevenue30d = sumBy(paidTotals30dRes?.data, "total");
  const paidOrders30d = Number(paidOrders30dRes?.count || 0);
  const aov30d = paidOrders30d > 0 ? paidRevenue30d / paidOrders30d : 0;

  return {
    cards: [
      { label: "Revenue Today", value: CURRENCY.format(Math.round(paidRevenueToday || 0)) },
      { label: "Revenue (7d)", value: CURRENCY.format(Math.round(paidRevenue7d || 0)) },
      { label: "Revenue (30d)", value: CURRENCY.format(Math.round(paidRevenue30d || 0)) },
      { label: "AOV (30d)", value: CURRENCY.format(Math.round(aov30d || 0)) },
      { label: "Orders Today", value: Number(todayOrdersRes?.count || 0).toLocaleString() },
      { label: "Pending Orders", value: Number(pendingOrdersRes?.count || 0).toLocaleString() },
      { label: "Paid Not Delivered", value: Number(paidNotDeliveredRes?.count || 0).toLocaleString() },
      { label: "Cancelled Orders", value: Number(cancelledOrdersRes?.count || 0).toLocaleString() },
      { label: "Failed Payments", value: Number(failedPaymentsRes?.count || 0).toLocaleString() },
      { label: "Cart Items", value: Number(cartItemsRes?.count || 0).toLocaleString() },
    ],
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

const ORDER_SELECT_CANDIDATES = [
  "id, user_id, total, subtotal, packaging_fee, delivery_fee, discount_total, promo_code, status, payment_status, payment_method, authentication_method, auth_method, delivery_status, delivery_address, created_at, updated_at",
  "id, user_id, total, subtotal, packaging_fee, delivery_fee, discount_total, promo_code, status, payment_status, authentication_method, auth_method, delivery_status, delivery_address, created_at, updated_at",
  "id, user_id, total, subtotal, packaging_fee, delivery_fee, discount_total, promo_code, status, payment_status, delivery_status, delivery_address, created_at, updated_at",
  "id, user_id, total, subtotal, delivery_fee, discount_total, promo_code, status, payment_status, payment_method, authentication_method, auth_method, delivery_status, delivery_address, created_at, updated_at",
  "id, user_id, total, subtotal, delivery_fee, discount_total, promo_code, status, payment_status, authentication_method, auth_method, delivery_status, delivery_address, created_at, updated_at",
  "id, user_id, total, subtotal, delivery_fee, discount_total, promo_code, status, payment_status, delivery_status, delivery_address, created_at, updated_at",
  "id, user_id, total, status, payment_status, payment_method, authentication_method, auth_method, delivery_status, delivery_address, created_at, updated_at",
  "id, user_id, total, status, payment_status, authentication_method, auth_method, delivery_status, delivery_address, created_at, updated_at",
  "id, user_id, total, status, payment_status, delivery_status, delivery_address, created_at, updated_at",
  "id, user_id, total, status, payment_status, payment_method, authentication_method, auth_method, delivery_address, created_at",
  "id, user_id, total, status, payment_status, authentication_method, auth_method, delivery_address, created_at",
  "id, user_id, total, status, payment_status, delivery_address, created_at",
];

const parseDateMs = (value) => {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : Number.NaN;
};

const hoursSince = (value, nowMs = Date.now()) => {
  const ms = parseDateMs(value);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (nowMs - ms) / (60 * 60 * 1000));
};

const formatAgeLabel = (hours) => {
  if (!Number.isFinite(hours)) return "-";
  if (hours >= 48) return `${Math.round(hours / 24)}d`;
  if (hours >= 1) return `${Math.round(hours)}h`;
  return `${Math.max(1, Math.round(hours * 60))}m`;
};

const STATUS_REQUIRING_PAYMENT = new Set(["paid", "processing", "shipped", "delivered", "completed"]);
const CLOSED_ORDER_STATUSES = new Set(["completed", "delivered", "cancelled"]);

const createExceptionSignal = ({ code, label, category, severity, detail, action }) => ({
  code,
  label,
  category,
  severity,
  detail,
  action,
});

const buildOrderExceptionState = (record, nowMs = Date.now()) => {
  const status = String(record?.status || "").trim().toLowerCase();
  const paymentStatus = String(record?.paymentStatus || "").trim().toLowerCase();
  const deliveryStatus = String(record?.deliveryStatus || "").trim().toLowerCase();
  const ageHours = hoursSince(record?.createdAt, nowMs);
  const updatedAgeHours = hoursSince(record?.updatedAt || record?.createdAt, nowMs);
  const signals = [];

  if (status === "stock_failed") {
    signals.push(
      createExceptionSignal({
        code: "stock_failed",
        label: "Stock Issue",
        category: "fulfilment",
        severity: 4,
        detail: "Inventory reservation failed for this order.",
        action: "Confirm stock, restock if needed, then move the order back to processing or cancel it.",
      })
    );
  }

  if (paymentStatus === "failed") {
    signals.push(
      createExceptionSignal({
        code: "payment_failed",
        label: "Payment Failed",
        category: "payment",
        severity: 4,
        detail: "Customer payment did not complete successfully.",
        action: "Ask the customer to retry payment or cancel the order.",
      })
    );
  }

  if (STATUS_REQUIRING_PAYMENT.has(status) && paymentStatus && paymentStatus !== "paid" && paymentStatus !== "refunded") {
    signals.push(
      createExceptionSignal({
        code: "status_payment_mismatch",
        label: "Mismatch",
        category: "payment",
        severity: 4,
        detail: `Order is marked ${status} while payment is ${paymentStatus}.`,
        action: "Correct the payment status or revert the order status before fulfilment continues.",
      })
    );
  }

  if (status === "cancelled" && paymentStatus === "paid") {
    signals.push(
      createExceptionSignal({
        code: "cancelled_paid",
        label: "Paid Cancelled",
        category: "refund",
        severity: 4,
        detail: "Order was cancelled while payment is still marked as paid.",
        action: "Refund the payment or mark payment status as refunded.",
      })
    );
  }

  if (paymentStatus === "refunded" && status !== "cancelled") {
    signals.push(
      createExceptionSignal({
        code: "refunded_open_order",
        label: "Refunded Open",
        category: "refund",
        severity: 3,
        detail: `Payment is refunded but order status is ${status || "open"}.`,
        action: "Close the order or cancel it after refund review.",
      })
    );
  }

  if ((status === "paid" || status === "processing") && Number.isFinite(ageHours) && ageHours >= 24) {
    signals.push(
      createExceptionSignal({
        code: "dispatch_delay",
        label: "Prolonged",
        category: "fulfilment",
        severity: ageHours >= 48 ? 4 : 3,
        detail: `Order is ${formatAgeLabel(ageHours)} old and still ${status}.`,
        action: "Confirm picking/packing status and move the order to shipped if it has left the hub.",
      })
    );
  }

  if (status === "shipped" && Number.isFinite(ageHours) && ageHours >= 72) {
    signals.push(
      createExceptionSignal({
        code: "transit_delay",
        label: "Prolonged",
        category: "fulfilment",
        severity: 3,
        detail: `Order has been shipped for ${formatAgeLabel(ageHours)} without completion.`,
        action: "Check rider progress and update the delivery status.",
      })
    );
  }

  if (!CLOSED_ORDER_STATUSES.has(status) && deliveryStatus.includes("awaiting dispatch") && Number.isFinite(ageHours) && ageHours >= 24) {
    signals.push(
      createExceptionSignal({
        code: "awaiting_dispatch_too_long",
        label: "Too Long",
        category: "fulfilment",
        severity: ageHours >= 48 ? 4 : 3,
        detail: `Delivery is still awaiting dispatch after ${formatAgeLabel(ageHours)}.`,
        action: "Schedule dispatch or update the delivery status so the team can see the bottleneck.",
      })
    );
  }

  if (!CLOSED_ORDER_STATUSES.has(status) && ["pending", "processing", "unpaid"].includes(paymentStatus) && Number.isFinite(ageHours) && ageHours >= 6) {
    signals.push(
      createExceptionSignal({
        code: "stale_payment_review",
        label: "Unresolved",
        category: "payment",
        severity: 2,
        detail: `Payment is ${paymentStatus} after ${formatAgeLabel(ageHours)}.`,
        action: "Follow up on payment confirmation or cancel the order if it is abandoned.",
      })
    );
  }

  if (status === "cancelled" && paymentStatus !== "paid" && paymentStatus !== "refunded") {
    signals.push(
      createExceptionSignal({
        code: "cancelled_order_review",
        label: "Cancelled",
        category: "cancelled",
        severity: 2,
        detail: "Cancelled orders should be reviewed for customer communication and stock release.",
        action: "Confirm the cancellation reason and ensure inventory is available again.",
      })
    );
  }

  const seenCodes = new Set();
  const dedupedSignals = signals.filter((signal) => {
    if (seenCodes.has(signal.code)) return false;
    seenCodes.add(signal.code);
    return true;
  });

  const severity = dedupedSignals.reduce((max, signal) => Math.max(max, signal.severity), 0);
  const categories = uniqueStrings(dedupedSignals.map((signal) => signal.category));
  const priority = dedupedSignals.reduce((max, signal) => {
    const ageWeight = Number.isFinite(ageHours) ? Math.min(999, Math.round(ageHours)) : 0;
    return Math.max(max, signal.severity * 1000 + ageWeight);
  }, 0);
  const primarySignal =
    dedupedSignals
      .slice()
      .sort((left, right) => right.severity - left.severity || left.label.localeCompare(right.label))[0] || null;

  return {
    ageHours,
    ageLabel: formatAgeLabel(ageHours),
    updatedAgeHours,
    issueAgeHours: Number.isFinite(updatedAgeHours) ? updatedAgeHours : ageHours,
    issueAgeLabel: formatAgeLabel(Number.isFinite(updatedAgeHours) ? updatedAgeHours : ageHours),
    hasExceptions: dedupedSignals.length > 0,
    exceptionSignals: dedupedSignals,
    exceptionCategories: categories,
    exceptionSeverity: severity,
    exceptionPriority: priority,
    primaryException: primarySignal,
    recommendedAction: primarySignal?.action || "",
  };
};

const mapOrderRecord = (row, userLookup, nowMs = Date.now()) => {
  const paymentMethod = readMethod(row);
  const record = {
    id: row.id,
    userId: row.user_id,
    customer: userLookup.get(String(row?.user_id || "")) || `User ${String(row?.user_id || "").slice(0, 8)}...`,
    total: toNumber(row.total),
    subtotal: row?.subtotal == null ? null : toNumber(row.subtotal),
    packagingFee: row?.packaging_fee == null ? null : toNumber(row.packaging_fee),
    deliveryFee: row?.delivery_fee == null ? null : toNumber(row.delivery_fee),
    discountTotal: row?.discount_total == null ? null : toNumber(row.discount_total),
    promoCode: String(row?.promo_code || "").trim(),
    status: String(row.status || "unknown"),
    paymentStatus: String(row.payment_status || "unknown"),
    paymentMethod,
    paymentIsManual: isManualPaymentMethod(paymentMethod),
    deliveryStatus: String(row.delivery_status || "").trim(),
    deliveryAddress: String(row.delivery_address || ""),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
  return {
    ...record,
    ...buildOrderExceptionState(record, nowMs),
  };
};

const sortExceptionRecords = (records) =>
  (Array.isArray(records) ? records : [])
    .slice()
    .sort((left, right) => {
      if (right.exceptionPriority !== left.exceptionPriority) return right.exceptionPriority - left.exceptionPriority;
      const leftCreated = parseDateMs(left.createdAt);
      const rightCreated = parseDateMs(right.createdAt);
      if (Number.isFinite(leftCreated) && Number.isFinite(rightCreated) && leftCreated !== rightCreated) {
        return leftCreated - rightCreated;
      }
      return Number(right.id || 0) - Number(left.id || 0);
    });

const matchesExceptionCategory = (record, category = "all") => {
  const normalized = String(category || "all").trim().toLowerCase();
  if (normalized === "all") return true;
  const issueAgeHours = Number(record?.issueAgeHours);
  if (normalized === "critical") return Number.isFinite(issueAgeHours) && issueAgeHours >= 48;
  if (normalized === "overdue") return Number.isFinite(issueAgeHours) && issueAgeHours >= 24 && issueAgeHours < 48;
  if (normalized === "at_risk" || normalized === "at-risk") return Number.isFinite(issueAgeHours) && issueAgeHours >= 6 && issueAgeHours < 24;
  if (normalized === "monitor") return !Number.isFinite(issueAgeHours) || issueAgeHours < 6;
  return Array.isArray(record?.exceptionCategories) && record.exceptionCategories.includes(normalized);
};

async function queryOrders(admin, { status = "all", paymentStatus = "all", from = 0, to = 24 } = {}) {
  let rows = [];
  let totalCount = 0;
  let usedSelect = "";
  let lastError = null;

  for (const select of ORDER_SELECT_CANDIDATES) {
    let query = admin
      .from("orders")
      .select(select, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (status !== "all") query = query.eq("status", status);
    if (paymentStatus !== "all") query = query.eq("payment_status", paymentStatus);
    const result = await query;
    if (!result.error) {
      rows = Array.isArray(result.data) ? result.data : [];
      totalCount = Number(result.count || 0);
      usedSelect = select;
      lastError = null;
      break;
    }
    lastError = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }

  return { rows, totalCount, usedSelect, lastError };
}

async function queryOrdersByIds(admin, orderIds = []) {
  const ids = uniqueStrings(orderIds);
  if (!ids.length) {
    return { rows: [], usedSelect: "", lastError: null };
  }

  let rows = [];
  let usedSelect = "";
  let lastError = null;

  for (const select of ORDER_SELECT_CANDIDATES) {
    const result = await admin
      .from("orders")
      .select(select)
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (!result.error) {
      rows = Array.isArray(result.data) ? result.data : [];
      usedSelect = select;
      lastError = null;
      break;
    }
    lastError = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }

  return { rows, usedSelect, lastError };
}

export async function loadOrdersMetrics({ status = "all", paymentStatus = "all", page = 1, pageSize = 25 } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(10, Number(pageSize || 25)));
  const start = (currentPage - 1) * size;
  const end = start + size - 1;

  const { rows, totalCount, usedSelect, lastError } = await queryOrders(admin, { status, paymentStatus, from: start, to: end });
  if (lastError) warnings.push(`Orders query failed: ${lastError.message}`);

  const userLookup = await loadUserLookup(admin, rows.map((row) => row?.user_id));
  const nowMs = Date.now();
  const records = rows.map((row) => mapOrderRecord(row, userLookup, nowMs));

  if (!usedSelect) {
    return { records: [], totalCount: 0, page: currentPage, pageSize: size, warnings };
  }

  return {
    records,
    totalCount,
    page: currentPage,
    pageSize: size,
    warnings,
  };
}

export async function loadOrderExceptionQueue({ category = "all", page = 1, pageSize = 15 } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(5, Number(pageSize || 15)));

  const { rows, usedSelect, lastError } = await queryOrders(admin, { from: 0, to: 4999 });
  if (lastError) warnings.push(`Order exception query failed: ${lastError.message}`);
  if (!usedSelect) {
    return {
      records: [],
      totalCount: 0,
      page: 1,
      pageSize: size,
      totalPages: 1,
      totalExceptions: 0,
      criticalCount: 0,
      overdueCount: 0,
      atRiskCount: 0,
      monitorCount: 0,
      paymentCount: 0,
      fulfilmentCount: 0,
      refundCount: 0,
      cancelledCount: 0,
      warnings,
      coverage: {
        refundsInferredFromStatus: true,
        replacementTrackingAvailable: false,
      },
    };
  }

  const userLookup = await loadUserLookup(admin, rows.map((row) => row?.user_id));
  const nowMs = Date.now();
  const enriched = rows.map((row) => mapOrderRecord(row, userLookup, nowMs)).filter((row) => row.hasExceptions);
  const sorted = sortExceptionRecords(enriched);
  const filtered = sorted.filter((row) => matchesExceptionCategory(row, category));
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;
  const records = filtered.slice(start, start + size);

  warnings.push("Refund-related exceptions are inferred from order and payment statuses. Replacement requests need dedicated schema tracking.");

  return {
    records,
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    totalExceptions: sorted.length,
    criticalCount: sorted.filter((row) => matchesExceptionCategory(row, "critical")).length,
    overdueCount: sorted.filter((row) => matchesExceptionCategory(row, "overdue")).length,
    atRiskCount: sorted.filter((row) => matchesExceptionCategory(row, "at_risk")).length,
    monitorCount: sorted.filter((row) => matchesExceptionCategory(row, "monitor")).length,
    paymentCount: sorted.filter((row) => row.exceptionCategories.includes("payment")).length,
    fulfilmentCount: sorted.filter((row) => row.exceptionCategories.includes("fulfilment")).length,
    refundCount: sorted.filter((row) => row.exceptionCategories.includes("refund")).length,
    cancelledCount: sorted.filter((row) => row.exceptionCategories.includes("cancelled")).length,
    warnings,
    coverage: {
      refundsInferredFromStatus: true,
      replacementTrackingAvailable: false,
    },
  };
}

export async function loadOrderSupportCaseMetrics({ page = 1, pageSize = 12, caseType = "all", caseStatus = "all" } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(5, Number(pageSize || 12)));
  const typeFilter = String(caseType || "all").trim().toLowerCase();
  const statusFilter = String(caseStatus || "all").trim().toLowerCase();

  const selectCandidates = [
    "id, order_id, user_id, case_type, case_status, refund_amount, reason, customer_note, admin_note, replacement_order_id, requested_at, resolved_at, created_by_email, updated_at",
    "id, order_id, user_id, case_type, case_status, refund_amount, reason, admin_note, replacement_order_id, requested_at, resolved_at, created_by_email, updated_at",
    "id, order_id, user_id, case_type, case_status, refund_amount, reason, requested_at, resolved_at, created_by_email, updated_at",
  ];

  let caseRows = [];
  let caseError = null;
  for (const select of selectCandidates) {
    const result = await admin
      .from("order_support_cases")
      .select(select)
      .order("requested_at", { ascending: false })
      .range(0, 4999);
    if (!result.error) {
      caseRows = Array.isArray(result.data) ? result.data : [];
      caseError = null;
      break;
    }
    caseError = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }

  if (caseError) {
    if (isUnknownColumnError(caseError.message)) {
      warnings.push("Order support cases are unavailable until the support-case migration is applied.");
    } else {
      warnings.push(`Order support cases query failed: ${caseError.message}`);
    }
    return {
      records: [],
      totalCount: 0,
      page: 1,
      pageSize: size,
      totalPages: 1,
      schemaAvailable: false,
      totalCases: 0,
      openCount: 0,
      reviewingCount: 0,
      resolvedCount: 0,
      totalRefundAmount: 0,
      warnings,
    };
  }

  const { rows: orderRows, lastError: orderError } = await queryOrdersByIds(admin, caseRows.map((row) => row?.order_id));
  if (orderError) warnings.push(`Support case order lookup failed: ${orderError.message}`);

  const orderUserIds = orderRows.map((row) => row?.user_id);
  const caseUserIds = caseRows.map((row) => row?.user_id);
  const userLookup = await loadUserLookup(admin, [...orderUserIds, ...caseUserIds]);
  const nowMs = Date.now();
  const orderLookup = new Map(
    orderRows.map((row) => {
      const mapped = mapOrderRecord(row, userLookup, nowMs);
      return [String(row?.id || ""), mapped];
    })
  );

  const records = caseRows
    .map((row) => {
      const orderId = String(row?.order_id || "").trim();
      const order = orderLookup.get(orderId) || null;
      const normalizedCaseType = normalizeOrderSupportCaseType(row?.case_type);
      const normalizedCaseStatus = normalizeOrderSupportCaseStatus(row?.case_status);
      const fallbackUserId = String(row?.user_id || "").trim();
      return {
        id: row?.id,
        orderId,
        userId: fallbackUserId,
        customer: order?.customer || userLookup.get(fallbackUserId) || `User ${fallbackUserId.slice(0, 8)}...`,
        caseType: normalizedCaseType,
        caseTypeLabel: getOrderSupportCaseTypeLabel(normalizedCaseType),
        caseStatus: normalizedCaseStatus,
        caseStatusLabel: getOrderSupportCaseStatusLabel(normalizedCaseStatus),
        refundAmount: toNumber(row?.refund_amount),
        reason: String(row?.reason || "").trim(),
        customerNote: String(row?.customer_note || "").trim(),
        adminNote: String(row?.admin_note || "").trim(),
        replacementOrderId: String(row?.replacement_order_id || "").trim(),
        requestedAt: row?.requested_at || row?.updated_at || null,
        resolvedAt: row?.resolved_at || null,
        createdByEmail: String(row?.created_by_email || "").trim(),
        orderTotal: order?.total ?? 0,
        orderStatus: order?.status || "",
        paymentStatus: order?.paymentStatus || "",
        deliveryStatus: order?.deliveryStatus || "",
      };
    })
    .filter((row) => (typeFilter === "all" ? true : row.caseType === typeFilter))
    .filter((row) => (statusFilter === "all" ? true : row.caseStatus === statusFilter));

  const totalCount = records.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;

  return {
    records: records.slice(start, start + size),
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    schemaAvailable: true,
    totalCases: caseRows.length,
    openCount: caseRows.filter((row) => normalizeOrderSupportCaseStatus(row?.case_status) === "open").length,
    reviewingCount: caseRows.filter((row) => normalizeOrderSupportCaseStatus(row?.case_status) === "reviewing").length,
    resolvedCount: caseRows.filter((row) => normalizeOrderSupportCaseStatus(row?.case_status) === "resolved").length,
    totalRefundAmount: caseRows.reduce((sum, row) => sum + toNumber(row?.refund_amount), 0),
    warnings,
  };
}

export async function loadOrderSupportOrderCatalogue({
  page = 1,
  pageSize = 12,
  query = "",
  status = "all",
  paymentStatus = "all",
  deliveryStatus = "all",
} = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(5, Number(pageSize || 12)));
  const search = String(query || "").trim().toLowerCase();
  const normalizedStatus = String(status || "all").trim().toLowerCase();
  const normalizedPaymentStatus = String(paymentStatus || "all").trim().toLowerCase();
  const normalizedDeliveryStatus = String(deliveryStatus || "all").trim().toLowerCase();

  const { rows, usedSelect, lastError } = await queryOrders(admin, { from: 0, to: 4999 });
  if (lastError) warnings.push(`Order support catalogue query failed: ${lastError.message}`);
  if (!usedSelect) {
    return {
      records: [],
      totalCount: 0,
      page: 1,
      pageSize: size,
      totalPages: 1,
      warnings,
    };
  }

  const supportCountByOrder = new Map();
  const supportOpenCountByOrder = new Map();
  const supportResult = await admin
    .from("order_support_cases")
    .select("order_id, case_status")
    .range(0, 4999);
  if (supportResult.error) {
    if (!isUnknownColumnError(supportResult.error.message)) {
      warnings.push(`Order support case counts unavailable: ${supportResult.error.message}`);
    }
  } else {
    (supportResult.data || []).forEach((row) => {
      const orderId = String(row?.order_id || "").trim();
      if (!orderId) return;
      supportCountByOrder.set(orderId, (supportCountByOrder.get(orderId) || 0) + 1);
      if (normalizeOrderSupportCaseStatus(row?.case_status) === "open") {
        supportOpenCountByOrder.set(orderId, (supportOpenCountByOrder.get(orderId) || 0) + 1);
      }
    });
  }

  const userLookup = await loadUserLookup(admin, rows.map((row) => row?.user_id));
  const nowMs = Date.now();
  const records = rows
    .map((row) => {
      const mapped = mapOrderRecord(row, userLookup, nowMs);
      const haystack = [
        mapped.id,
        mapped.customer,
        mapped.status,
        mapped.paymentStatus,
        mapped.deliveryStatus,
        mapped.promoCode,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      return {
        ...mapped,
        supportCaseCount: supportCountByOrder.get(String(mapped.id || "")) || 0,
        openSupportCaseCount: supportOpenCountByOrder.get(String(mapped.id || "")) || 0,
        searchText: haystack,
      };
    })
    .filter((row) => {
      if (search && !row.searchText.includes(search)) return false;
      if (normalizedStatus !== "all" && String(row.status || "").toLowerCase() !== normalizedStatus) return false;
      if (normalizedPaymentStatus !== "all" && String(row.paymentStatus || "").toLowerCase() !== normalizedPaymentStatus) return false;
      if (normalizedDeliveryStatus !== "all" && String(row.deliveryStatus || "").toLowerCase() !== normalizedDeliveryStatus) return false;
      return true;
    });

  const totalCount = records.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;

  return {
    records: records.slice(start, start + size),
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    warnings,
  };
}

const mapOrderItemRecord = (row) => {
  const product = Array.isArray(row?.products) ? row.products[0] : row?.products;
  return {
    id: row?.id ?? `${row?.order_id || ""}-${row?.product_id || ""}`,
    orderId: row?.order_id,
    productId: row?.product_id,
    variantId: row?.variant_id ?? null,
    productName: row?.product_name || product?.name || `Product ${String(row?.product_id || "").slice(0, 8)}...`,
    unit: row?.unit || product?.unit || "",
    quantity: toNumber(row?.quantity),
    unitPrice: toNumber(row?.unit_price),
    lineTotal: toNumber(row?.quantity) * toNumber(row?.unit_price),
    imageUrl: product?.image_url || row?.image_url || "",
  };
};

export async function loadOrderAdminDetail(orderId) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const safeOrderId = String(orderId || "").trim();
  if (!safeOrderId) {
    return { order: null, items: [], supportCases: [], warnings };
  }

  const { rows, lastError } = await queryOrdersByIds(admin, [safeOrderId]);
  if (lastError) warnings.push(`Order detail query failed: ${lastError.message}`);
  const userLookup = await loadUserLookup(admin, rows.map((row) => row?.user_id));
  const order = rows[0] ? mapOrderRecord(rows[0], userLookup, Date.now()) : null;
  if (!order) {
    return { order: null, items: [], supportCases: [], warnings };
  }

  let itemRows = [];
  let itemError = null;
  const itemSelectCandidates = [
    "id, order_id, product_id, variant_id, quantity, unit_price, products(name, unit, image_url)",
    "id, order_id, product_id, quantity, unit_price, products(name, unit, image_url)",
    "id, order_id, product_id, variant_id, quantity, unit_price",
    "id, order_id, product_id, quantity, unit_price",
  ];
  for (const select of itemSelectCandidates) {
    const result = await admin.from("order_items").select(select).eq("order_id", safeOrderId).range(0, 499);
    if (!result.error) {
      itemRows = Array.isArray(result.data) ? result.data : [];
      itemError = null;
      break;
    }
    itemError = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }
  if (itemError) warnings.push(`Order items query failed: ${itemError.message}`);

  let supportCases = [];
  const supportResult = await admin
    .from("order_support_cases")
    .select("id, order_id, user_id, case_type, case_status, refund_amount, reason, customer_note, admin_note, replacement_order_id, requested_at, resolved_at, created_by_email, updated_at")
    .eq("order_id", safeOrderId)
    .order("updated_at", { ascending: false })
    .range(0, 99);
  if (supportResult.error) {
    if (!isUnknownColumnError(supportResult.error.message)) {
      warnings.push(`Order support notes query failed: ${supportResult.error.message}`);
    }
  } else {
    supportCases = (Array.isArray(supportResult.data) ? supportResult.data : []).map((row) => ({
      id: row?.id,
      orderId: row?.order_id,
      caseType: normalizeOrderSupportCaseType(row?.case_type),
      caseTypeLabel: getOrderSupportCaseTypeLabel(row?.case_type),
      caseStatus: normalizeOrderSupportCaseStatus(row?.case_status),
      caseStatusLabel: getOrderSupportCaseStatusLabel(row?.case_status),
      refundAmount: toNumber(row?.refund_amount),
      reason: String(row?.reason || "").trim(),
      customerNote: String(row?.customer_note || "").trim(),
      adminNote: String(row?.admin_note || "").trim(),
      replacementOrderId: String(row?.replacement_order_id || "").trim(),
      requestedAt: row?.requested_at || row?.updated_at,
      resolvedAt: row?.resolved_at || null,
      createdByEmail: String(row?.created_by_email || "").trim(),
      updatedAt: row?.updated_at,
    }));
  }

  return {
    order,
    items: itemRows.map(mapOrderItemRecord),
    supportCases,
    warnings,
  };
}

export async function loadInventoryMetrics({ lowStockThreshold = 5 } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();

  const variantSelectCandidates = [
    "id, product_id, name, unit, stock_count, price, old_price, is_default, is_active",
    "id, product_id, name, stock_count, price, old_price",
    "id, product_id, name, price, old_price",
    "id, product_id, name, stock_count, price",
    "id, product_id, name, price",
  ];

  let variantRows = [];
  let variantError = null;
  for (const select of variantSelectCandidates) {
    const result = await admin.from("product_variants").select(select).range(0, 4999);
    if (!result.error) {
      variantRows = Array.isArray(result.data) ? result.data : [];
      variantError = null;
      break;
    }
    variantError = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }
  if (variantError && !variantRows.length) {
    warnings.push(`Variant stock unavailable: ${variantError.message}`);
  }

  const productMetaById = new Map();
  const productIds = uniqueStrings(variantRows.map((row) => row?.product_id));
  if (productIds.length) {
    const groups = chunk(productIds, 400);
    for (const ids of groups) {
      const result = await admin.from("products").select("id, name, in_season, is_active").in("id", ids);
      if (result.error) {
        warnings.push(`Product details unavailable: ${result.error.message}`);
        continue;
      }
      (Array.isArray(result.data) ? result.data : []).forEach((row) => {
        const id = String(row?.id || "").trim();
        if (!id) return;
        productMetaById.set(id, {
          name: String(row?.name || "").trim(),
          inSeason: row?.in_season !== false,
          rawInSeason: row?.in_season ?? null,
          isActive: row?.is_active !== false,
        });
      });
    }
  }

  const source = variantRows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: productMetaById.get(String(row?.product_id || "").trim())?.name || "",
    variantName: String(row?.name || "").trim() || `Variant ${String(row?.id || "").slice(0, 8)}`,
    name: (() => {
      const productName = productMetaById.get(String(row?.product_id || "").trim())?.name || "";
      const variantName = String(row?.name || "").trim();
      if (productName && variantName) return `${productName} - ${variantName}`;
      if (productName) return productName;
      if (variantName) return variantName;
      return `Variant ${String(row?.id || "").slice(0, 8)}`;
    })(),
    stock: parseAvailableStock(row),
    price: toNumber(row.price),
    oldPrice: row?.old_price == null ? null : toNumber(row.old_price),
    unit: String(row?.unit || "").trim(),
    isDefault: row?.is_default === true,
    variantActive: row?.is_active !== false,
    productInSeason: productMetaById.get(String(row?.product_id || "").trim())?.inSeason !== false,
    productRawInSeason: productMetaById.get(String(row?.product_id || "").trim())?.rawInSeason ?? null,
    productActive: productMetaById.get(String(row?.product_id || "").trim())?.isActive !== false,
  })).filter((row) => row.variantActive);

  const outOfStock = source.filter((row) => row.stock != null && row.stock <= 0);
  const lowStock = source.filter((row) => row.stock != null && row.stock > 0 && row.stock <= Number(lowStockThreshold || 5));
  const unknownStock = source.filter((row) => row.stock == null);

  return {
    totalTracked: source.length,
    outOfStockCount: outOfStock.length,
    lowStockCount: lowStock.length,
    unknownStockCount: unknownStock.length,
    lowStock,
    outOfStock,
    warnings,
  };
}

export async function loadSupplierRestockPlanningData({ page = 1, pageSize = 12, query = "", filter = "all" } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(5, Number(pageSize || 12)));
  const search = String(query || "").trim().toLowerCase();
  const normalizedFilter = normalizeSupplierRestockFilter(filter);

  const variantSelectCandidates = [
    "id, product_id, name, unit, stock_count, is_default, is_active, supplier_id, purchase_cost, restock_lead_time_days, last_restock_date, expected_restock_date",
    "id, product_id, name, stock_count, supplier_id, purchase_cost, restock_lead_time_days, last_restock_date, expected_restock_date",
  ];

  let variantRows = [];
  let variantError = null;
  for (const select of variantSelectCandidates) {
    const result = await admin.from("product_variants").select(select).range(0, 4999);
    if (!result.error) {
      variantRows = Array.isArray(result.data) ? result.data : [];
      variantError = null;
      break;
    }
    variantError = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }

  if (variantError && !variantRows.length) {
    if (isUnknownColumnError(variantError.message)) {
      warnings.push("Supplier restock planning is unavailable until the supplier planning migration is applied.");
    } else {
      warnings.push(`Supplier restock planning query failed: ${variantError.message}`);
    }
    return {
      records: [],
      totalCount: 0,
      page: 1,
      pageSize: size,
      totalPages: 1,
      totalVariants: 0,
      activeSuppliers: 0,
      assignedSupplierCount: 0,
      missingSupplierCount: 0,
      missingPlanCount: 0,
      overdueCount: 0,
      dueSoonCount: 0,
      orderNowCount: 0,
      schemaAvailable: false,
      warnings,
    };
  }

  const suppliersRes = await admin.from("suppliers").select("id, name, is_active").order("name", { ascending: true });
  if (suppliersRes.error) {
    if (isUnknownColumnError(suppliersRes.error.message)) {
      warnings.push("Supplier restock planning is unavailable until the supplier planning migration is applied.");
    } else {
      warnings.push(`Suppliers query failed: ${suppliersRes.error.message}`);
    }
    return {
      records: [],
      totalCount: 0,
      page: 1,
      pageSize: size,
      totalPages: 1,
      totalVariants: 0,
      activeSuppliers: 0,
      assignedSupplierCount: 0,
      missingSupplierCount: 0,
      missingPlanCount: 0,
      overdueCount: 0,
      dueSoonCount: 0,
      orderNowCount: 0,
      schemaAvailable: false,
      warnings,
    };
  }

  const productMetaById = new Map();
  const productIds = uniqueStrings(variantRows.map((row) => row?.product_id));
  if (productIds.length) {
    const groups = chunk(productIds, 400);
    for (const ids of groups) {
      const result = await admin.from("products").select("id, name, is_active").in("id", ids);
      if (result.error) {
        warnings.push(`Supplier planning product lookup failed: ${result.error.message}`);
        continue;
      }
      (Array.isArray(result.data) ? result.data : []).forEach((row) => {
        const id = String(row?.id || "").trim();
        if (!id) return;
        productMetaById.set(id, {
          name: String(row?.name || "").trim(),
          isActive: row?.is_active !== false,
        });
      });
    }
  }

  const suppliers = Array.isArray(suppliersRes.data) ? suppliersRes.data : [];
  const supplierById = new Map(
    suppliers.map((row) => [
      String(row?.id || ""),
      {
        id: row?.id,
        name: String(row?.name || "").trim(),
        isActive: row?.is_active !== false,
      },
    ])
  );

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const records = variantRows
    .map((row) => {
      const product = productMetaById.get(String(row?.product_id || "")) || null;
      const supplier = supplierById.get(String(row?.supplier_id || "")) || null;
      const productName = product?.name || `Product ${String(row?.product_id || "").slice(0, 8)}...`;
      const variantName = String(row?.name || "").trim() || "Default";
      const unit = String(row?.unit || "").trim();
      const expectedRestockDate = String(row?.expected_restock_date || "").trim();
      const leadTimeDays = row?.restock_lead_time_days == null ? null : Number(row.restock_lead_time_days);
      const purchaseCost = row?.purchase_cost == null ? null : Number(row.purchase_cost);
      const schedule = getRestockScheduleState({ expectedRestockDate, now });
      const orderByDate = calculateRestockOrderByDate(expectedRestockDate, leadTimeDays);
      const missingFields = getRestockPlanningMissingFields({
        supplierId: row?.supplier_id ?? null,
        supplierName: supplier?.name || "",
        purchaseCost,
        leadTimeDays,
      });
      const orderNow = Boolean(orderByDate) && orderByDate <= today;

      return {
        productId: row?.product_id,
        productName,
        productActive: product?.isActive !== false,
        variantId: row?.id,
        variantName,
        unit,
        stockCount: parseAvailableStock(row),
        isDefault: row?.is_default === true,
        variantActive: row?.is_active !== false,
        supplierId: row?.supplier_id ?? null,
        supplierName: supplier?.name || "",
        supplierActive: supplier?.isActive !== false,
        purchaseCost: purchaseCost == null || Number.isNaN(purchaseCost) ? null : purchaseCost,
        leadTimeDays: leadTimeDays == null || Number.isNaN(leadTimeDays) ? null : leadTimeDays,
        lastRestockDate: String(row?.last_restock_date || "").trim(),
        expectedRestockDate,
        orderByDate,
        orderNow,
        scheduleCode: schedule.code,
        scheduleLabel: schedule.label,
        missingFields,
        needsPlanning: missingFields.length > 0,
        searchText: `${productName} ${variantName} ${unit} ${supplier?.name || ""}`.trim().toLowerCase(),
      };
    })
    .sort((a, b) => {
      const leftPriority =
        (a.scheduleCode === "overdue" ? 0 : a.orderNow ? 1 : a.needsPlanning ? 2 : a.scheduleCode === "due_today" ? 3 : a.scheduleCode === "due_soon" ? 4 : 5);
      const rightPriority =
        (b.scheduleCode === "overdue" ? 0 : b.orderNow ? 1 : b.needsPlanning ? 2 : b.scheduleCode === "due_today" ? 3 : b.scheduleCode === "due_soon" ? 4 : 5);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      if (a.expectedRestockDate && b.expectedRestockDate && a.expectedRestockDate !== b.expectedRestockDate) {
        return a.expectedRestockDate.localeCompare(b.expectedRestockDate);
      }
      const byProduct = a.productName.localeCompare(b.productName, "en", { sensitivity: "base" });
      if (byProduct !== 0) return byProduct;
      return a.variantName.localeCompare(b.variantName, "en", { sensitivity: "base" });
    });

  const filtered = records.filter(
    (row) => (!search || row.searchText.includes(search)) && matchesSupplierRestockFilter(row, normalizedFilter, now)
  );
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;
  const paged = filtered.slice(start, start + size);

  return {
    records: paged,
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    totalVariants: records.length,
    activeSuppliers: suppliers.filter((row) => row?.is_active !== false).length,
    assignedSupplierCount: records.filter((row) => row.supplierId != null).length,
    missingSupplierCount: records.filter((row) => row.missingFields.includes("supplier")).length,
    missingPlanCount: records.filter((row) => row.needsPlanning).length,
    overdueCount: records.filter((row) => row.scheduleCode === "overdue").length,
    dueSoonCount: records.filter((row) => row.scheduleCode === "due_today" || row.scheduleCode === "due_soon").length,
    orderNowCount: records.filter((row) => row.orderNow).length,
    schemaAvailable: true,
    warnings,
  };
}

export async function loadInventoryLossMetrics({ days = 30, page = 1, pageSize = 12, type = "all" } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const windowDays = Math.max(1, Math.min(365, Number(days || 30)));
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(5, Number(pageSize || 12)));
  const normalizedType = String(type || "all").trim().toLowerCase();
  const typeFilter = normalizedType === "all" ? "all" : normalizeInventoryLossType(normalizedType);

  const selectCandidates = [
    "id, stock_movement_id, variant_id, product_id, loss_type, quantity, note, occurred_at, recorded_by_email, created_at",
    "id, variant_id, product_id, loss_type, quantity, note, occurred_at, recorded_by_email, created_at",
    "id, variant_id, product_id, loss_type, quantity, note, occurred_at, created_at",
  ];

  let rows = [];
  let lossError = null;
  for (const select of selectCandidates) {
    const result = await admin
      .from("inventory_loss_events")
      .select(select)
      .gte("occurred_at", daysAgoIso(windowDays))
      .order("occurred_at", { ascending: false })
      .range(0, 4999);
    if (!result.error) {
      rows = Array.isArray(result.data) ? result.data : [];
      lossError = null;
      break;
    }
    lossError = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }

  if (lossError) {
    if (isUnknownColumnError(lossError.message)) {
      warnings.push("Inventory loss tracking is unavailable until the inventory loss migration is applied.");
    } else {
      warnings.push(`Inventory loss metrics unavailable: ${lossError.message}`);
    }
    return {
      records: [],
      totalCount: 0,
      page: 1,
      pageSize: size,
      totalPages: 1,
      schemaAvailable: false,
      totalUnitsLost: 0,
      totalEvents: 0,
      typeFilter,
      windowDays,
      breakdown: [],
      warnings,
    };
  }

  const variantIds = uniqueStrings(rows.map((row) => row?.variant_id));
  const productIds = uniqueStrings(rows.map((row) => row?.product_id));
  const variantLookup = new Map();
  const productLookup = new Map();

  if (variantIds.length) {
    for (const group of chunk(variantIds, 400)) {
      const result = await admin
        .from("product_variants")
        .select("id, product_id, name, unit")
        .in("id", group);
      if (result.error) {
        warnings.push(`Inventory loss variant lookup failed: ${result.error.message}`);
        break;
      }
      (result.data || []).forEach((row) => {
        const id = String(row?.id || "").trim();
        if (!id) return;
        variantLookup.set(id, {
          productId: row?.product_id,
          name: String(row?.name || "").trim() || `Variant ${id.slice(0, 8)}...`,
          unit: String(row?.unit || "").trim(),
        });
      });
    }
  }

  if (productIds.length) {
    for (const group of chunk(productIds, 400)) {
      const result = await admin
        .from("products")
        .select("id, name")
        .in("id", group);
      if (result.error) {
        warnings.push(`Inventory loss product lookup failed: ${result.error.message}`);
        break;
      }
      (result.data || []).forEach((row) => {
        const id = String(row?.id || "").trim();
        if (!id) return;
        productLookup.set(id, String(row?.name || "").trim() || `Product ${id.slice(0, 8)}...`);
      });
    }
  }

  const enriched = rows
    .map((row) => {
      const variantId = String(row?.variant_id || "").trim();
      const productId = String(row?.product_id || "").trim();
      const variant = variantLookup.get(variantId) || null;
      const productName = productLookup.get(productId) || `Product ${productId.slice(0, 8)}...`;
      const variantName = variant?.name || `Variant ${variantId.slice(0, 8)}...`;
      const unit = variant?.unit || "";
      const quantity = Math.max(0, toNumber(row?.quantity));
      const lossType = normalizeInventoryLossType(row?.loss_type);
      const occurredAt = row?.occurred_at || row?.created_at || null;

      return {
        id: row?.id,
        stockMovementId: row?.stock_movement_id ?? null,
        variantId: row?.variant_id,
        productId: row?.product_id,
        productName,
        variantName,
        itemName: `${productName} - ${variantName}`,
        unit,
        lossType,
        lossTypeLabel: getInventoryLossTypeLabel(lossType),
        quantity,
        note: String(row?.note || "").trim(),
        occurredAt,
        recordedByEmail: String(row?.recorded_by_email || "").trim(),
      };
    })
    .sort((left, right) => {
      const rightMs = parseDateMs(right.occurredAt);
      const leftMs = parseDateMs(left.occurredAt);
      if (Number.isFinite(rightMs) && Number.isFinite(leftMs) && rightMs !== leftMs) {
        return rightMs - leftMs;
      }
      if (Number.isFinite(rightMs)) return -1;
      if (Number.isFinite(leftMs)) return 1;
      return Number(right.id || 0) - Number(left.id || 0);
    });

  const filtered = typeFilter === "all" ? enriched : enriched.filter((row) => row.lossType === typeFilter);
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;
  const records = filtered.slice(start, start + size);
  const typeTotals = new Map();
  enriched.forEach((row) => {
    const current = typeTotals.get(row.lossType) || { events: 0, quantity: 0 };
    current.events += 1;
    current.quantity += row.quantity;
    typeTotals.set(row.lossType, current);
  });

  const breakdown = Array.from(typeTotals.entries())
    .map(([lossType, totals]) => ({
      lossType,
      label: getInventoryLossTypeLabel(lossType),
      eventCount: totals.events,
      quantity: totals.quantity,
    }))
    .sort((left, right) => right.quantity - left.quantity || left.label.localeCompare(right.label));

  return {
    records,
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    schemaAvailable: true,
    totalUnitsLost: enriched.reduce((sum, row) => sum + row.quantity, 0),
    totalEvents: enriched.length,
    typeFilter,
    windowDays,
    breakdown,
    warnings,
  };
}

export async function loadInventoryLossCatalogue({ page = 1, pageSize = 12, query = "" } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(5, Number(pageSize || 12)));
  const search = String(query || "").trim().toLowerCase();

  const [productsRes, variantsRes] = await Promise.all([
    admin.from("products").select("id, name, is_active").range(0, 4999),
    admin
      .from("product_variants")
      .select("id, product_id, name, unit, stock_count, is_default, is_active")
      .range(0, 4999),
  ]);

  if (productsRes.error) warnings.push(`Inventory loss products query failed: ${productsRes.error.message}`);
  if (variantsRes.error) warnings.push(`Inventory loss variants query failed: ${variantsRes.error.message}`);

  const productLookup = new Map(
    (Array.isArray(productsRes.data) ? productsRes.data : []).map((row) => [
      String(row?.id || ""),
      {
        name: String(row?.name || "").trim(),
        isActive: row?.is_active !== false,
      },
    ])
  );

  const records = (Array.isArray(variantsRes.data) ? variantsRes.data : [])
    .map((row) => {
      const product = productLookup.get(String(row?.product_id || "")) || null;
      const productName = product?.name || `Product ${String(row?.product_id || "").slice(0, 8)}...`;
      const variantName = String(row?.name || "").trim() || "Default";
      const stockCount = row?.stock_count == null ? null : Math.max(0, toNumber(row?.stock_count));
      return {
        productId: row?.product_id,
        productName,
        productActive: product?.isActive !== false,
        variantId: row?.id,
        variantName,
        unit: String(row?.unit || "").trim(),
        stockCount,
        isDefault: row?.is_default === true,
        variantActive: row?.is_active !== false,
        searchText: `${productName} ${variantName} ${String(row?.unit || "")}`.trim().toLowerCase(),
      };
    })
    .filter((row) => row.stockCount != null && row.stockCount > 0)
    .sort((a, b) => {
      const byProduct = a.productName.localeCompare(b.productName, "en", { sensitivity: "base" });
      if (byProduct !== 0) return byProduct;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.variantName.localeCompare(b.variantName, "en", { sensitivity: "base" });
    });

  const filtered = search ? records.filter((row) => row.searchText.includes(search)) : records;
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;

  return {
    records: filtered.slice(start, start + size),
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    totalInStockVariants: records.length,
    warnings,
  };
}

export async function loadProductAdminCatalogue({ page = 1, pageSize = 25, query = "" } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(10, Number(pageSize || 25)));
  const search = String(query || "").trim().toLowerCase();

  const [productsRes, variantsRes] = await Promise.all([
    admin.from("products").select("id, name, in_season, is_active").range(0, 4999),
    admin
      .from("product_variants")
      .select("id, product_id, name, unit, price, old_price, stock_count, is_default, is_active, purchase_mode, min_quantity, max_quantity, step_quantity, base_unit, base_quantity")
      .range(0, 4999),
  ]);

  if (productsRes.error) warnings.push(`Products catalogue query failed: ${productsRes.error.message}`);
  if (variantsRes.error) warnings.push(`Product variants catalogue query failed: ${variantsRes.error.message}`);

  const products = Array.isArray(productsRes.data) ? productsRes.data : [];
  const variants = Array.isArray(variantsRes.data) ? variantsRes.data : [];
  const productLookup = new Map(
    products.map((row) => [
      String(row?.id || ""),
      {
        id: row?.id,
        name: String(row?.name || "").trim(),
        inSeason: row?.in_season !== false,
        rawInSeason: row?.in_season,
        isActive: row?.is_active !== false,
      },
    ])
  );

  const records = variants
    .map((row) => {
      const product = productLookup.get(String(row?.product_id || "")) || null;
      const productName = product?.name || `Product ${String(row?.product_id || "").slice(0, 8)}...`;
      const variantName = String(row?.name || "").trim() || "Default";
      const unit = String(row?.unit || "").trim();
      const searchText = `${productName} ${variantName} ${unit}`.toLowerCase();

      return {
        productId: row?.product_id,
        productName,
        productInSeason: product?.inSeason !== false,
        productRawInSeason: product?.rawInSeason ?? null,
        productActive: product?.isActive !== false,
        variantId: row?.id,
        variantName,
        unit,
        price: toNumber(row?.price),
        oldPrice: row?.old_price == null ? null : toNumber(row?.old_price),
        stockCount: row?.stock_count == null ? null : Math.max(0, toNumber(row?.stock_count)),
        purchaseMode: normalizePurchaseMode(row?.purchase_mode),
        minQuantity: row?.min_quantity == null ? null : toNumber(row?.min_quantity),
        maxQuantity: row?.max_quantity == null ? null : toNumber(row?.max_quantity),
        stepQuantity: row?.step_quantity == null ? null : toNumber(row?.step_quantity),
        baseUnit: String(row?.base_unit || "").trim(),
        baseQuantity: row?.base_quantity == null ? null : toNumber(row?.base_quantity),
        isDefault: row?.is_default === true,
        variantActive: row?.is_active !== false,
        searchText,
      };
    })
    .sort((a, b) => {
      const byProduct = a.productName.localeCompare(b.productName, "en", { sensitivity: "base" });
      if (byProduct !== 0) return byProduct;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.variantName.localeCompare(b.variantName, "en", { sensitivity: "base" });
    });

  const filtered = search ? records.filter((row) => row.searchText.includes(search)) : records;
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;
  const paged = filtered.slice(start, start + size);
  const outOfSeasonProducts = products.filter((row) => row?.in_season === false).length;

  return {
    records: paged,
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    totalProducts: products.length,
    totalVariants: variants.length,
    inSeasonProducts: Math.max(0, products.length - outOfSeasonProducts),
    outOfSeasonProducts,
    warnings,
  };
}

export async function loadProductSeasonAdminCatalogue({ page = 1, pageSize = 25, query = "" } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(10, Number(pageSize || 25)));
  const search = String(query || "").trim().toLowerCase();

  const productsRes = await admin
    .from("products")
    .select("id, name, in_season, is_active, category_id, image_url, is_bundle_eligible")
    .range(0, 4999);
  if (productsRes.error) warnings.push(`Products season query failed: ${productsRes.error.message}`);

  const products = (Array.isArray(productsRes.data) ? productsRes.data : [])
    .map((row) => ({
      productId: row?.id,
      productName: String(row?.name || "").trim() || `Product ${String(row?.id || "").slice(0, 8)}...`,
      productInSeason: row?.in_season !== false,
      productRawInSeason: row?.in_season ?? null,
      productActive: row?.is_active !== false,
      categoryId: row?.category_id ?? "",
      imageUrl: row?.image_url || "",
      isBundleEligible: row?.is_bundle_eligible === true,
      searchText: `${String(row?.name || "")} ${String(row?.image_url || "")}`.trim().toLowerCase(),
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName, "en", { sensitivity: "base" }));

  const filtered = search ? products.filter((row) => row.searchText.includes(search)) : products;
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;
  const paged = filtered.slice(start, start + size);
  const outOfSeasonProducts = products.filter((row) => row.productInSeason === false).length;

  return {
    records: paged,
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    totalProducts: products.length,
    inSeasonProducts: Math.max(0, products.length - outOfSeasonProducts),
    outOfSeasonProducts,
    warnings,
  };
}

export async function loadProductDataQualityReport({ page = 1, pageSize = 25, query = "", issue = "all" } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(10, Number(pageSize || 25)));
  const search = String(query || "").trim().toLowerCase();
  const normalizedIssue = normalizeProductDataQualityFilter(issue);
  const emptyIssueCounts = createProductDataQualityIssueCounts();

  const productsRes = await admin.from("products").select("id, name, in_season, is_active").range(0, 4999);
  if (productsRes.error) {
    warnings.push(`Products quality query failed: ${productsRes.error.message}`);
    return {
      records: [],
      totalCount: 0,
      page: 1,
      pageSize: size,
      totalPages: 1,
      totalProducts: 0,
      flaggedProducts: 0,
      countsByIssue: emptyIssueCounts,
      schemaAvailable: false,
      imageCoverageAvailable: false,
      packagingCoverageAvailable: false,
      promoStateAvailable: false,
      warnings,
    };
  }

  const variantBase = await selectRowsWithFallback(admin, "product_variants", [
    "id, product_id, name, unit, price, is_active",
    "id, product_id, name, unit, price",
    "id, product_id, name, price, is_active",
    "id, product_id, name, price",
    "id, product_id, name",
  ]);
  if (variantBase.error && !variantBase.rows.length) {
    warnings.push(`Product variants quality query failed: ${variantBase.error.message}`);
    return {
      records: [],
      totalCount: 0,
      page: 1,
      pageSize: size,
      totalPages: 1,
      totalProducts: Array.isArray(productsRes.data) ? productsRes.data.length : 0,
      flaggedProducts: 0,
      countsByIssue: emptyIssueCounts,
      schemaAvailable: false,
      imageCoverageAvailable: false,
      packagingCoverageAvailable: false,
      promoStateAvailable: false,
      warnings,
    };
  }

  const productImageFields = await selectRowsWithFallback(admin, "products", [
    "id, image, image_url",
    "id, image",
    "id, image_url",
    "id",
  ]);
  const promoFields = await selectRowsWithFallback(admin, "products", ["id, promo_tag_enabled", "id"]);
  const productImagesRes = await admin.from("product_images").select("product_id").range(0, 4999);

  if (productImageFields.error) {
    warnings.push(`Product image field lookup failed: ${productImageFields.error.message}`);
  }
  if (promoFields.error && !isUnknownColumnError(promoFields.error.message)) {
    warnings.push(`Promo state lookup failed: ${promoFields.error.message}`);
  }
  if (productImagesRes.error && !isUnknownColumnError(productImagesRes.error.message)) {
    warnings.push(`Product image gallery lookup failed: ${productImagesRes.error.message}`);
  }

  const products = Array.isArray(productsRes.data) ? productsRes.data : [];
  const variants = Array.isArray(variantBase.rows) ? variantBase.rows : [];
  const variantFields = parseSelectFields(variantBase.matchedSelect);
  const unitFieldAvailable = variantFields.includes("unit");
  const priceFieldAvailable = variantFields.includes("price");
  const productImageColumns = parseSelectFields(productImageFields.matchedSelect).filter((field) => field !== "id");
  const promoStateAvailable = parseSelectFields(promoFields.matchedSelect).includes("promo_tag_enabled");
  const imageCoverageAvailable = productImageColumns.length > 0 || !productImagesRes.error;
  const packagingCoverageAvailable = false;

  if (!unitFieldAvailable) {
    warnings.push("Measurement unit field is unavailable on product variants.");
  }
  if (!priceFieldAvailable) {
    warnings.push("Variant price field is unavailable on product variants.");
  }
  if (!imageCoverageAvailable) {
    warnings.push("Product image coverage is unavailable because no product image fields or gallery table could be read.");
  }
  if (!promoStateAvailable) {
    warnings.push("Promo visibility toggle is unavailable until the promo enabled migration is applied.");
  }

  const productHasImageById = new Map(
    productImageFields.rows.map((row) => [String(row?.id || "").trim(), hasAnyPopulatedField(row, productImageColumns)])
  );
  const promoStateByProductId = new Map(
    promoFields.rows.map((row) => [String(row?.id || "").trim(), row?.promo_tag_enabled])
  );
  const galleryProductIds = new Set(
    (Array.isArray(productImagesRes.data) ? productImagesRes.data : [])
      .map((row) => String(row?.product_id || "").trim())
      .filter(Boolean)
  );

  const variantsByProductId = new Map();
  variants.forEach((row) => {
    const productId = String(row?.product_id || "").trim();
    if (!productId) return;
    if (!variantsByProductId.has(productId)) {
      variantsByProductId.set(productId, []);
    }
    variantsByProductId.get(productId).push(row);
  });

  const records = products
    .map((row) => {
      const productId = String(row?.id || "").trim();
      const productName = String(row?.name || "").trim() || `Product ${productId.slice(0, 8)}...`;
      const productVariants = variantsByProductId.get(productId) || [];
      const activeVariants = productVariants.filter((variant) => variant?.is_active !== false);
      const hasImage = (productHasImageById.get(productId) === true) || galleryProductIds.has(productId);
      const hasPackaging = null;
      const hasUnit = unitFieldAvailable ? productVariants.some((variant) => hasNonEmptyText(variant?.unit)) : null;
      const hasActiveVariant = activeVariants.length > 0;
      const hasPrice = priceFieldAvailable
        ? activeVariants.some((variant) => {
            const price = toFiniteNumberOrNull(variant?.price);
            return price != null && price > 0;
          })
        : null;
      const seasonValueKnown = row?.in_season != null;
      const promoStateKnown = promoStateAvailable
        ? promoStateByProductId.get(productId) !== undefined && promoStateByProductId.get(productId) !== null
        : null;

      const issueCodes = [];
      if (imageCoverageAvailable && !hasImage) issueCodes.push("missing_image");
      if (unitFieldAvailable && !hasUnit) issueCodes.push("missing_unit");
      if (packagingCoverageAvailable && !hasPackaging) issueCodes.push("missing_packaging_type");
      if (!hasActiveVariant) issueCodes.push("no_active_variant");
      if (priceFieldAvailable && !hasPrice) issueCodes.push("no_price");
      if (!seasonValueKnown) issueCodes.push("no_season_value");
      if (promoStateAvailable && !promoStateKnown) issueCodes.push("no_promo_state");

      const issueLabels = issueCodes.map((value) => getProductDataQualityIssueLabel(value));

      return {
        productId: row?.id,
        productName,
        productActive: row?.is_active !== false,
        productInSeason: row?.in_season,
        variantCount: productVariants.length,
        activeVariantCount: activeVariants.length,
        hasImage,
        hasUnit,
        hasPackaging,
        hasPrice,
        promoStateKnown,
        issueCodes,
        issueLabels,
        issueCount: issueCodes.length,
        searchText: `${productName} ${issueLabels.join(" ")}`.trim().toLowerCase(),
      };
    })
    .filter((row) => row.issueCount > 0)
    .sort((a, b) => {
      if (a.issueCount !== b.issueCount) return b.issueCount - a.issueCount;
      if (a.productActive !== b.productActive) return a.productActive ? -1 : 1;
      return a.productName.localeCompare(b.productName, "en", { sensitivity: "base" });
    });

  const countsByIssue = createProductDataQualityIssueCounts();
  records.forEach((row) => {
    row.issueCodes.forEach((code) => {
      countsByIssue[code] = Number(countsByIssue[code] || 0) + 1;
    });
  });

  const filtered = records.filter(
    (row) => (!search || row.searchText.includes(search)) && matchesProductDataQualityFilter(row, normalizedIssue)
  );
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;
  const paged = filtered.slice(start, start + size);

  return {
    records: paged,
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    totalProducts: products.length,
    flaggedProducts: records.length,
    countsByIssue,
    schemaAvailable: true,
    imageCoverageAvailable,
    packagingCoverageAvailable,
    promoStateAvailable,
    warnings,
  };
}

export async function loadProductReferenceData() {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();

  const unitSelectCandidates = [
    "unit, base_unit, weight_unit, volume_unit",
    "unit, base_unit, weight_unit",
    "unit, base_unit",
    "unit",
  ];

  let variantRows = [];
  let unitFields = [];
  let unitError = null;
  for (const select of unitSelectCandidates) {
    const result = await admin.from("product_variants").select(select).range(0, 4999);
    if (!result.error) {
      variantRows = Array.isArray(result.data) ? result.data : [];
      unitFields = select.split(",").map((value) => value.trim()).filter(Boolean);
      unitError = null;
      break;
    }
    unitError = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }
  if (unitError && !variantRows.length) {
    warnings.push(`Measurement units unavailable: ${unitError.message}`);
  }

  const measurementUnits = uniqueStrings(
    variantRows.flatMap((row) => unitFields.map((field) => row?.[field]))
  );

  const packagingSources = [
    { table: "packaging_material_types", select: "name", field: "name" },
    { table: "packaging_material_types", select: "label", field: "label" },
    { table: "packaging_types", select: "name", field: "name" },
    { table: "material_types", select: "name", field: "name" },
  ];

  let packagingMaterialTypes = [];
  let packagingSource = null;
  for (const source of packagingSources) {
    const result = await admin.from(source.table).select(source.select).not(source.field, "is", null).range(0, 4999);
    if (result.error) {
      if (!isUnknownColumnError(result.error.message)) {
        warnings.push(`Packaging material lookup failed: ${result.error.message}`);
        break;
      }
      continue;
    }

    packagingMaterialTypes = uniqueStrings((result.data || []).map((row) => row?.[source.field]));
    packagingSource = `${source.table}.${source.field}`;
    break;
  }

  return {
    measurementUnits,
    packagingMaterialTypes,
    measurementSource: unitFields.length ? `product_variants.${unitFields.join(", product_variants.")}` : null,
    packagingSource,
    warnings,
  };
}

export async function loadProductMerchandisingAdminCatalogue({ page = 1, pageSize = 25, query = "", filter = "all" } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(10, Number(pageSize || 25)));
  const search = String(query || "").trim().toLowerCase();
  const normalizedFilter = normalizeProductMerchandisingFilter(filter);

  const select = `id, name, is_active, ${PRODUCT_MERCHANDISING_SELECT_FIELDS}`;
  const result = await admin.from("products").select(select).range(0, 4999);
  if (result.error) {
    if (isUnknownColumnError(result.error.message)) {
      warnings.push("Product merchandising flags are unavailable until the merchandising migration is applied.");
    } else {
      warnings.push(`Product merchandising query failed: ${result.error.message}`);
    }
    return {
      records: [],
      totalCount: 0,
      page: 1,
      pageSize: size,
      totalPages: 1,
      totalProducts: 0,
      flaggedCount: 0,
      hiddenCount: 0,
      featuredCount: 0,
      bestsellerCount: 0,
      newArrivalCount: 0,
      homepagePickCount: 0,
      bundleEligibleCount: 0,
      schemaAvailable: false,
      warnings,
    };
  }

  const records = (Array.isArray(result.data) ? result.data : [])
    .map((row) => {
      const merchandising = normalizeProductMerchandisingRecord(row);
      return {
        productId: row?.id,
        productName: String(row?.name || "").trim() || `Product ${String(row?.id || "").slice(0, 8)}...`,
        productActive: row?.is_active !== false,
        searchText: `${String(row?.name || "")} ${merchandising.activeFlagLabels.join(" ")}`.trim().toLowerCase(),
        ...merchandising,
      };
    })
    .sort((a, b) => {
      if (a.isHidden !== b.isHidden) return a.isHidden ? -1 : 1;
      if (a.hasAnyMerchandisingFlag !== b.hasAnyMerchandisingFlag) return a.hasAnyMerchandisingFlag ? -1 : 1;
      if (a.activeFlags.length !== b.activeFlags.length) return b.activeFlags.length - a.activeFlags.length;
      return a.productName.localeCompare(b.productName, "en", { sensitivity: "base" });
    });

  const filtered = records.filter(
    (row) => (!search || row.searchText.includes(search)) && matchesProductMerchandisingFilter(row, normalizedFilter)
  );
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;
  const paged = filtered.slice(start, start + size);

  return {
    records: paged,
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    totalProducts: records.length,
    flaggedCount: records.filter((row) => row.hasAnyMerchandisingFlag).length,
    hiddenCount: records.filter((row) => row.isHidden).length,
    featuredCount: records.filter((row) => row.isFeatured).length,
    bestsellerCount: records.filter((row) => row.isBestseller).length,
    newArrivalCount: records.filter((row) => row.isNewArrival).length,
    homepagePickCount: records.filter((row) => row.isHomepagePick).length,
    bundleEligibleCount: records.filter((row) => row.isBundleEligible).length,
    schemaAvailable: true,
    warnings,
  };
}

export async function loadProductPromoAdminCatalogue({ page = 1, pageSize = 25, query = "" } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(10, Number(pageSize || 25)));
  const search = String(query || "").trim().toLowerCase();

  const selectCandidates = [
    "id, name, is_active, promo_tag_text, promo_tag_expires_at, promo_tag_enabled",
    "id, name, is_active, promo_tag_text, promo_tag_expires_at",
    "id, name, is_active",
  ];

  let productRows = [];
  let productError = null;
  let promoSchemaAvailable = false;
  let promoToggleAvailable = false;
  for (const select of selectCandidates) {
    const result = await admin.from("products").select(select).range(0, 4999);
    if (!result.error) {
      productRows = Array.isArray(result.data) ? result.data : [];
      promoSchemaAvailable = select.includes("promo_tag_text");
      promoToggleAvailable = select.includes("promo_tag_enabled");
      productError = null;
      break;
    }
    productError = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }
  if (productError && !productRows.length) {
    warnings.push(`Products promo query failed: ${productError.message}`);
  }
  if (!promoSchemaAvailable) {
    warnings.push("Promo tag fields are unavailable until the promo migration is applied.");
  }
  if (promoSchemaAvailable && !promoToggleAvailable) {
    warnings.push("Promo visibility toggle is unavailable until the promo enabled migration is applied.");
  }

  const records = productRows
    .map((row) => {
      const promoTagText = normalizePromoText(row?.promo_tag_text);
      const promoTagExpiresAt = parsePromoExpiry(row?.promo_tag_expires_at);
      const promoTagEnabled = normalizePromoEnabled(row?.promo_tag_enabled);
      const promo = getProductPromoState({ promoTagText, promoTagExpiresAt, promoTagEnabled }, Date.now());

      return {
        productId: row?.id,
        productName: String(row?.name || "").trim() || `Product ${String(row?.id || "").slice(0, 8)}...`,
        productActive: row?.is_active !== false,
        promoTagText,
        promoTagExpiresAt,
        promoTagEnabled,
        promoIsActive: promo.isActive,
        promoIsExpired: promo.isExpired,
        searchText: `${String(row?.name || "")} ${promoTagText || ""}`.trim().toLowerCase(),
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, "en", { sensitivity: "base" }));

  const filtered = search ? records.filter((row) => row.searchText.includes(search)) : records;
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;
  const paged = filtered.slice(start, start + size);
  const activePromoCount = records.filter((row) => row.promoIsActive && row.promoTagText).length;

  return {
    records: paged,
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    totalProducts: records.length,
    activePromoCount,
    promoSchemaAvailable,
    promoToggleAvailable,
    warnings,
  };
}

export async function loadPromoCodeAdminData({ page = 1, pageSize = 25, query = "" } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(10, Number(pageSize || 25)));
  const search = String(query || "").trim().toLowerCase();

  const result = await admin
    .from("promo_codes")
    .select(
      "id, code, description, discount_type, discount_value, min_subtotal, max_discount, starts_at, expires_at, usage_limit, usage_count, is_active, created_at, updated_at"
    )
    .order("code", { ascending: true });

  if (result.error) {
    if (isUnknownColumnError(result.error.message)) {
      warnings.push("Promo codes are unavailable until the promo code migration is applied.");
    } else {
      warnings.push(`Promo code query failed: ${result.error.message}`);
    }
    return {
      records: [],
      totalCount: 0,
      page: 1,
      pageSize: size,
      totalPages: 1,
      activeCount: 0,
      expiredCount: 0,
      scheduledCount: 0,
      schemaAvailable: false,
      warnings,
    };
  }

  const nowMs = Date.now();
  const rows = (Array.isArray(result.data) ? result.data : []).map((row) => {
    const promo = normalizePromoCodeRecord(row);
    const startsMs = promo?.startsAt ? Date.parse(promo.startsAt) : Number.NaN;
    const expiresMs = promo?.expiresAt ? Date.parse(promo.expiresAt) : Number.NaN;
    const scheduled = Number.isFinite(startsMs) && startsMs > nowMs;
    const expired = Number.isFinite(expiresMs) && expiresMs <= nowMs;
    return {
      ...promo,
      scheduled,
      expired,
      searchText: `${promo?.code || ""} ${promo?.description || ""}`.trim().toLowerCase(),
    };
  });

  const filtered = search ? rows.filter((row) => row.searchText.includes(search)) : rows;
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;
  const paged = filtered.slice(start, start + size);

  return {
    records: paged,
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    activeCount: rows.filter((row) => row.isActive && !row.expired && !row.scheduled).length,
    expiredCount: rows.filter((row) => row.expired).length,
    scheduledCount: rows.filter((row) => row.scheduled).length,
    schemaAvailable: true,
    warnings,
  };
}

export async function loadBannerAdminData({ page = 1, pageSize = 20, query = "", placement = DEFAULT_BANNER_PLACEMENT } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(10, Number(pageSize || 20)));
  const search = String(query || "").trim().toLowerCase();
  const normalizedPlacement = normalizeBannerPlacement(placement);

  const result = await admin.from("banner_urls").select("*").limit(500);
  if (result.error) {
    if (isUnknownColumnError(result.error.message)) {
      warnings.push("Banner management is unavailable until the banner table exists.");
    } else {
      warnings.push(`Banner query failed: ${result.error.message}`);
    }
    return {
      records: [],
      totalCount: 0,
      page: 1,
      pageSize: size,
      totalPages: 1,
      liveCount: 0,
      scheduledCount: 0,
      expiredCount: 0,
      inactiveCount: 0,
      schemaAvailable: false,
      warnings,
    };
  }

  let mobileCandidates = [];
  try {
    const storageList = await admin.storage
      .from(HERO_BANNER_BUCKET)
      .list("", { limit: 200, sortBy: { column: "name", order: "asc" } });
    if (storageList.error) {
      warnings.push(`Banner storage lookup failed: ${storageList.error.message}`);
    } else {
      mobileCandidates = buildMobileCandidates(admin, storageList.data || []);
    }
  } catch (error) {
    warnings.push(`Banner storage lookup failed: ${error?.message || String(error)}`);
  }

  const rows = sortBanners(
    (Array.isArray(result.data) ? result.data : [])
      .map((row) => {
        const banner = normalizeBannerRecord(row);
        if (!banner) return null;
        const inferredMobileImage = banner.mobileImage ? "" : inferMobileImage(banner.image, mobileCandidates);
        const resolvedMobileImage = banner.mobileImage || inferredMobileImage || "";
        const status = getBannerStatus(banner);
        return {
          ...banner,
          mobileImage: resolvedMobileImage,
          mobileImageSource: banner.mobileImage ? "stored" : inferredMobileImage ? "inferred" : "none",
          status: status.code,
          statusLabel: status.label,
          searchText: createBannerSearchText({ ...banner, mobileImage: resolvedMobileImage }),
        };
      })
      .filter(Boolean)
      .filter((row) => row.placement === normalizedPlacement)
  );

  const filtered = search ? rows.filter((row) => row.searchText.includes(search)) : rows;
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;
  const paged = filtered.slice(start, start + size);

  return {
    records: paged,
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    liveCount: rows.filter((row) => row.status === "live").length,
    scheduledCount: rows.filter((row) => row.status === "scheduled").length,
    expiredCount: rows.filter((row) => row.status === "expired").length,
    inactiveCount: rows.filter((row) => row.status === "inactive").length,
    schemaAvailable: true,
    warnings,
  };
}

export async function loadDeliverySettingsAdminData() {
  return loadDeliverySettingsAdminDataBase();
}

export async function loadAdminStaffControlData({ page = 1, pageSize = 20, query = "", filter = "all" } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const currentPage = Math.max(1, Number(page || 1));
  const size = Math.min(100, Math.max(10, Number(pageSize || 20)));
  const search = String(query || "").trim().toLowerCase();
  const normalizedFilter = normalizeAdminStaffFilter(filter);

  const userSelectCandidates = [
    "id, auth_id, email, first_name, last_name, name, role, is_active, created_at, updated_at",
    "id, email, first_name, last_name, name, role, is_active, created_at, updated_at",
    "id, auth_id, email, first_name, last_name, name, role, created_at, updated_at",
    "id, email, first_name, last_name, name, role, created_at, updated_at",
  ];

  const [usersRes, logsRes] = await Promise.all([
    selectRowsWithFallback(admin, "users", userSelectCandidates),
    admin
      .from("admin_logs")
      .select("type, route, actor, message, metadata, created_at")
      .order("created_at", { ascending: false })
      .range(0, 499),
  ]);

  if (usersRes.error && !usersRes.rows.length) {
    warnings.push(`Users staff lookup failed: ${usersRes.error.message}`);
  }
  if (logsRes.error) {
    warnings.push(`Admin audit lookup failed: ${logsRes.error.message}`);
  }

  const roleSchemaAvailable = parseSelectFields(usersRes.matchedSelect).some((field) => field === "role");

  if (!roleSchemaAvailable) {
    warnings.push("Role fields are unavailable until the users table exposes role.");
  }

  const activityByEmail = new Map();
  (Array.isArray(logsRes.data) ? logsRes.data : []).forEach((row) => {
    const email = String(row?.actor || row?.metadata?.actor || row?.metadata?.created_by_email || "").trim().toLowerCase();
    if (!email) return;
    const current = activityByEmail.get(email) || { count: 0, lastAt: "" };
    current.count += 1;
    current.lastAt = firstNonEmptyText(current.lastAt, row?.created_at);
    activityByEmail.set(email, current);
  });

  const mergedByKey = new Map();
  const mergeRows = (rows, source) => {
    rows.forEach((row, index) => {
      const key = firstNonEmptyText(row?.id, row?.auth_id, row?.email, `${source}:${index}`);
      const existing = mergedByKey.get(key) || {
        key,
        actionUserId: "",
        email: "",
        firstName: "",
        lastName: "",
        name: "",
        roleRaw: "",
        isAdminRaw: undefined,
        isActiveRaw: undefined,
        createdAt: "",
        updatedAt: "",
        sources: [],
      };

      mergedByKey.set(key, {
        ...existing,
        actionUserId: firstNonEmptyText(existing.actionUserId, row?.id, row?.auth_id),
        email: firstNonEmptyText(existing.email, row?.email),
        firstName: firstNonEmptyText(existing.firstName, row?.first_name),
        lastName: firstNonEmptyText(existing.lastName, row?.last_name),
        name: firstNonEmptyText(existing.name, row?.name),
        roleRaw: firstNonEmptyText(existing.roleRaw, row?.role),
        isActiveRaw: firstDefinedValue(existing.isActiveRaw, row?.is_active),
        createdAt: firstNonEmptyText(existing.createdAt, row?.created_at),
        updatedAt: firstNonEmptyText(existing.updatedAt, row?.updated_at),
        sources: uniqueStrings([...(existing.sources || []), source]),
      });
    });
  };

  mergeRows(Array.isArray(usersRes.rows) ? usersRes.rows : [], "users");

  const records = Array.from(mergedByKey.values())
    .map((row) => {
      const rawEmail = String(row.email || "").trim();
      const email = rawEmail.toLowerCase();
      const dbRole = normalizeAdminRole(row.roleRaw);
      const role = dbRole === "admin" || dbRole === "super_admin" ? dbRole : null;
      const roleSource = role && hasNonEmptyText(row.roleRaw) ? "db_role" : null;
      const displayName =
        firstNonEmptyText(`${row.firstName} ${row.lastName}`.trim(), row.name, rawEmail) ||
        (row.actionUserId ? `User ${row.actionUserId.slice(0, 8)}...` : "Unknown User");
      const isActive = row.isActiveRaw === true;
      const activity = activityByEmail.get(email) || { count: 0, lastAt: "" };

      return {
        id: row.key,
        actionUserId: row.actionUserId,
        displayName,
        email: rawEmail,
        role,
        roleLabel: getAdminRoleLabel(role),
        roleSource,
        hasWorkspaceAccess: role != null && isActive,
        isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        recentAdminActivityCount: activity.count,
        lastAdminActivityAt: activity.lastAt,
        sources: row.sources,
        searchText: `${displayName} ${email} ${getAdminRoleLabel(role)} ${(row.sources || []).join(" ")}`.trim().toLowerCase(),
      };
    })
    .sort((a, b) => {
      if (a.hasWorkspaceAccess !== b.hasWorkspaceAccess) return a.hasWorkspaceAccess ? -1 : 1;
      const byRole = getAdminRoleRank(b.role) - getAdminRoleRank(a.role);
      if (byRole !== 0) return byRole;
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (a.recentAdminActivityCount !== b.recentAdminActivityCount) {
        return b.recentAdminActivityCount - a.recentAdminActivityCount;
      }
      return a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
    });

  const filtered = records.filter(
    (row) => (!search || row.searchText.includes(search)) && matchesAdminStaffFilter(row, normalizedFilter)
  );
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * size;
  const paged = filtered.slice(start, start + size);

  return {
    records: paged,
    totalCount,
    page: safePage,
    pageSize: size,
    totalPages,
    totalUsers: records.length,
    workspaceAccessCount: records.filter((row) => row.hasWorkspaceAccess).length,
    superAdminCount: records.filter((row) => row.role === "super_admin").length,
    adminCount: records.filter((row) => row.role === "admin").length,
    inactiveCount: records.filter((row) => row.isActive === false).length,
    recentActorCount: records.filter((row) => row.recentAdminActivityCount > 0).length,
    roleSchemaAvailable,
    auditAvailable: !logsRes.error,
    schemaAvailable: !(usersRes.error && !usersRes.rows.length),
    warnings,
  };
}

export async function loadProductPerformanceMetrics({ days = 30 } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const since = daysAgoIso(days);

  const paidOrdersRes = await admin
    .from("orders")
    .select("id")
    .eq("payment_status", "paid")
    .gte("created_at", since)
    .range(0, 4999);
  if (paidOrdersRes.error) warnings.push(`Paid orders query failed: ${paidOrdersRes.error.message}`);
  const orderIds = uniqueStrings((paidOrdersRes.data || []).map((row) => row.id));

  let orderItems = [];
  if (orderIds.length) {
    const orderItemChunks = chunk(orderIds, 400);
    const candidates = [
      "order_id, product_id, quantity, unit_price",
      "order_id, product_id, quantity, price",
      "order_id, product_id, quantity",
    ];

    for (const group of orderItemChunks) {
      let resolved = false;
      for (const select of candidates) {
        const result = await admin.from("order_items").select(select).in("order_id", group);
        if (!result.error) {
          orderItems.push(...(Array.isArray(result.data) ? result.data : []));
          resolved = true;
          break;
        }
        if (!isUnknownColumnError(result.error.message)) {
          warnings.push(`Order items query failed: ${result.error.message}`);
          resolved = true;
          break;
        }
      }
      if (!resolved) {
        warnings.push("Order items query failed for all candidate schemas.");
      }
    }
  }

  const perfMap = new Map();
  orderItems.forEach((item) => {
    const productId = String(item?.product_id || "").trim();
    if (!productId) return;
    const quantity = Math.max(0, toNumber(item?.quantity));
    const unitPrice = toNumber(item?.unit_price ?? item?.price);
    const prev = perfMap.get(productId) || { productId, unitsSold: 0, revenue: 0 };
    prev.unitsSold += quantity;
    prev.revenue += quantity * unitPrice;
    perfMap.set(productId, prev);
  });

  const soldProductIds = Array.from(perfMap.keys());
  const productsById = new Map();
  if (soldProductIds.length) {
    const productChunks = chunk(soldProductIds, 400);
    for (const group of productChunks) {
      const result = await admin
        .from("products")
        .select("id, name")
        .in("id", group);
      if (result.error) {
        warnings.push(`Product lookup failed: ${result.error.message}`);
        continue;
      }
      (result.data || []).forEach((row) => {
        productsById.set(String(row?.id || ""), String(row?.name || "Product"));
      });
    }
  }

  const soldProducts = Array.from(perfMap.values()).map((row) => ({
    ...row,
    name: productsById.get(row.productId) || `Product ${row.productId.slice(0, 8)}...`,
  }));
  soldProducts.sort((a, b) => b.revenue - a.revenue);

  const allProducts = [];
  const productsPageSize = 1000;
  let productsFrom = 0;
  while (true) {
    const productsTo = productsFrom + productsPageSize - 1;
    const result = await admin.from("products").select("id, name").range(productsFrom, productsTo);
    if (result.error) {
      warnings.push(`All products query failed: ${result.error.message}`);
      break;
    }
    const batch = Array.isArray(result.data) ? result.data : [];
    allProducts.push(...batch);
    if (batch.length < productsPageSize) break;
    productsFrom += productsPageSize;
  }

  const unsoldAll = allProducts.filter((row) => !perfMap.has(String(row?.id || "")));
  const totalUnsoldProducts = unsoldAll.length;
  const unsold = unsoldAll.map((row) => ({ productId: String(row?.id || ""), name: String(row?.name || "Product") }));

  return {
    totalSoldProducts: soldProducts.length,
    totalProductsTracked: allProducts.length,
    totalUnsoldProducts,
    topByRevenue: soldProducts.slice(0, 20),
    topByUnits: soldProducts.slice().sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 20),
    lowPerformers: soldProducts.slice().sort((a, b) => a.unitsSold - b.unitsSold).slice(0, 20),
    unsold,
    warnings,
  };
}

export async function loadCustomerMetrics({ days = 7 } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const since = daysAgoIso(days);

  const totalUsersRes = await admin.from("users").select("id", { head: true, count: "exact" });
  if (totalUsersRes.error) warnings.push(`Users count failed: ${totalUsersRes.error.message}`);

  let newUsersCount = 0;
  const newUsersRes = await admin.from("users").select("id", { head: true, count: "exact" }).gte("created_at", since);
  if (newUsersRes.error) {
    if (!isUnknownColumnError(newUsersRes.error.message)) {
      warnings.push(`New users metric failed: ${newUsersRes.error.message}`);
    }
  } else {
    newUsersCount = Number(newUsersRes.count || 0);
  }

  const paidOrdersRes = await admin
    .from("orders")
    .select("user_id, total, created_at")
    .eq("payment_status", "paid")
    .gte("created_at", daysAgoIso(90))
    .range(0, 4999);
  if (paidOrdersRes.error) warnings.push(`Customer orders metric failed: ${paidOrdersRes.error.message}`);

  const orders = Array.isArray(paidOrdersRes.data) ? paidOrdersRes.data : [];
  const map = new Map();
  orders.forEach((row) => {
    const userId = String(row?.user_id || "").trim();
    if (!userId) return;
    const prev = map.get(userId) || { userId, orders: 0, spend: 0 };
    prev.orders += 1;
    prev.spend += toNumber(row?.total);
    map.set(userId, prev);
  });

  const buyers = Array.from(map.values());
  const repeatCustomers = buyers.filter((row) => row.orders >= 2).length;
  const topSpenders = buyers.sort((a, b) => b.spend - a.spend).slice(0, 20);

  const userLookup = await loadUserLookup(admin, topSpenders.map((row) => row.userId));
  const rankedCustomers = topSpenders.map((row) => ({
    ...row,
    label: userLookup.get(row.userId) || `User ${row.userId.slice(0, 8)}...`,
  }));

  return {
    totalUsers: Number(totalUsersRes.count || 0),
    newUsers: newUsersCount,
    buyers90d: buyers.length,
    repeatCustomers,
    rankedCustomers,
    warnings,
  };
}

export async function loadAnalyticsMetrics({ days = 30 } = {}) {
  const admin = getSupabaseAdminClient();
  const warnings = createWarnings();
  const since = daysAgoIso(days);

  const orderSelectCandidates = [
    "id, total, status, payment_status, payment_method, authentication_method, auth_method, created_at",
    "id, total, status, payment_status, authentication_method, auth_method, created_at",
    "id, total, status, payment_status, created_at",
  ];
  let orders = [];
  let orderError = null;
  for (const select of orderSelectCandidates) {
    const result = await admin.from("orders").select(select).gte("created_at", since).range(0, 4999);
    if (!result.error) {
      orders = Array.isArray(result.data) ? result.data : [];
      orderError = null;
      break;
    }
    orderError = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }
  if (orderError && !orders.length) warnings.push(`Analytics order query failed: ${orderError.message}`);

  const paymentMethodMap = new Map();
  const statusMap = new Map();
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  orders.forEach((row) => {
    const status = String(row?.status || "unknown").toLowerCase();
    statusMap.set(status, (statusMap.get(status) || 0) + 1);

    const method = readMethod(row);
    const curr = paymentMethodMap.get(method) || { method, count: 0, revenue: 0 };
    curr.count += 1;
    if (String(row?.payment_status || "").toLowerCase() === "paid") {
      curr.revenue += toNumber(row?.total);
    }
    paymentMethodMap.set(method, curr);

    const date = new Date(row?.created_at);
    if (!Number.isNaN(date.getTime())) {
      const hour = date.getHours();
      if (hourly[hour]) hourly[hour].orders += 1;
    }
  });

  const cartSelectCandidates = [
    "id, user_id, product_id, quantity, created_at",
    "id, user_id, product_id, quantity",
  ];
  let cartItems = [];
  let cartError = null;
  for (const select of cartSelectCandidates) {
    const result = await admin.from("cart_items").select(select).range(0, 4999);
    if (!result.error) {
      cartItems = Array.isArray(result.data) ? result.data : [];
      cartError = null;
      break;
    }
    cartError = result.error;
    if (!isUnknownColumnError(result.error.message)) break;
  }
  if (cartError && !cartItems.length) warnings.push(`Cart analytics query failed: ${cartError.message}`);

  const activeCartUsers = uniqueStrings(cartItems.map((row) => row?.user_id)).length;
  const mostAddedMap = new Map();
  let staleCarts = 0;
  cartItems.forEach((row) => {
    const productId = String(row?.product_id || "").trim();
    if (productId) {
      mostAddedMap.set(productId, (mostAddedMap.get(productId) || 0) + toNumber(row?.quantity || 1));
    }
    const createdAt = row?.created_at ? new Date(row.created_at) : null;
    if (createdAt && !Number.isNaN(createdAt.getTime())) {
      const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      if (ageHours >= 24) staleCarts += 1;
    }
  });
  const mostAddedProducts = Array.from(mostAddedMap.entries())
    .map(([productId, qty]) => ({ productId, quantity: qty }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const ratingsRes = await admin.from("product_ratings").select("product_id, rating").range(0, 4999);
  if (ratingsRes.error) warnings.push(`Ratings analytics failed: ${ratingsRes.error.message}`);
  const ratingsRows = Array.isArray(ratingsRes.data) ? ratingsRes.data : [];
  const ratingsBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  ratingsRows.forEach((row) => {
    const rating = Math.min(5, Math.max(1, Math.round(toNumber(row?.rating))));
    if (!rating) return;
    ratingsBreakdown[rating] += 1;
    ratingSum += rating;
  });
  const totalRatings = Object.values(ratingsBreakdown).reduce((sum, count) => sum + count, 0);
  const averageRating = totalRatings > 0 ? Number((ratingSum / totalRatings).toFixed(2)) : 0;

  return {
    paymentMethods: Array.from(paymentMethodMap.values()).sort((a, b) => b.revenue - a.revenue),
    statusCounts: Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })),
    hourly,
    activeCartUsers,
    staleCarts,
    mostAddedProducts,
    totalRatings,
    averageRating,
    ratingsBreakdown,
    warnings,
  };
}

export const adminFormatters = {
  currency: (value) => CURRENCY.format(Math.round(toNumber(value))),
  number: (value) => toNumber(value).toLocaleString(),
  dateTime: formatDateTime,
  statusTone,
};
