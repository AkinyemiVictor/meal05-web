const DAY_MS = 24 * 60 * 60 * 1000;

export const SUPPLIER_RESTOCK_FILTER_OPTIONS = [
  { value: "all", label: "All Variants" },
  { value: "overdue", label: "Overdue Restocks" },
  { value: "due_soon", label: "Due Soon" },
  { value: "order_now", label: "Order Now" },
  { value: "missing_supplier", label: "Missing Supplier" },
  { value: "missing_plan", label: "Missing Plan Fields" },
];

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const toDateOnly = (value) => {
  const iso = String(value || "").trim();
  if (!iso) return "";
  if (DATE_ONLY_RE.test(iso)) return iso;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().slice(0, 10);
};

const toUtcDateMs = (value) => {
  const dateOnly = toDateOnly(value);
  if (!dateOnly) return Number.NaN;
  return Date.parse(`${dateOnly}T00:00:00.000Z`);
};

const formatDateFromMs = (ms) => {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().slice(0, 10);
};

export const normalizeSupplierName = (value) => String(value || "").trim();

export const normalizePlanningDate = (value) => toDateOnly(value);

export const isPlanningDate = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  return normalizePlanningDate(text) === text;
};

export const normalizeRestockLeadTimeDays = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return null;
  const days = Math.round(numeric);
  if (days < 0 || days > 365) return null;
  return days;
};

export const normalizePurchaseCost = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Number(numeric.toFixed(2));
};

export const calculateRestockOrderByDate = (expectedRestockDate, leadTimeDays) => {
  const expectedMs = toUtcDateMs(expectedRestockDate);
  const days = normalizeRestockLeadTimeDays(leadTimeDays);
  if (!Number.isFinite(expectedMs) || days == null) return "";
  return formatDateFromMs(expectedMs - days * DAY_MS);
};

export const getRestockScheduleState = ({ expectedRestockDate, now = new Date() } = {}) => {
  const expectedMs = toUtcDateMs(expectedRestockDate);
  if (!Number.isFinite(expectedMs)) {
    return { code: "unscheduled", label: "Unscheduled" };
  }

  const nowMs = Date.parse(`${formatDateFromMs(now.getTime())}T00:00:00.000Z`);
  const deltaDays = Math.round((expectedMs - nowMs) / DAY_MS);

  if (deltaDays < 0) return { code: "overdue", label: "Overdue" };
  if (deltaDays === 0) return { code: "due_today", label: "Due Today" };
  if (deltaDays <= 7) return { code: "due_soon", label: "Due Soon" };
  return { code: "scheduled", label: "Scheduled" };
};

export const getRestockPlanningMissingFields = ({
  supplierId = null,
  supplierName = "",
  purchaseCost = null,
  leadTimeDays = null,
} = {}) => {
  const missing = [];
  if (!supplierId && !normalizeSupplierName(supplierName)) missing.push("supplier");
  if (normalizePurchaseCost(purchaseCost) == null) missing.push("purchase_cost");
  if (normalizeRestockLeadTimeDays(leadTimeDays) == null) missing.push("lead_time_days");
  return missing;
};

export const getRestockPlanningMissingFieldLabel = (field) => {
  if (field === "supplier") return "Supplier";
  if (field === "purchase_cost") return "Purchase Cost";
  if (field === "lead_time_days") return "Lead Time";
  return "Planning Field";
};

export const normalizeSupplierRestockFilter = (value) => {
  const normalized = String(value || "all").trim().toLowerCase();
  return SUPPLIER_RESTOCK_FILTER_OPTIONS.some((option) => option.value === normalized) ? normalized : "all";
};

export const matchesSupplierRestockFilter = (record, filter = "all", now = new Date()) => {
  const normalized = normalizeSupplierRestockFilter(filter);
  if (normalized === "all") return true;

  const missing = getRestockPlanningMissingFields(record);
  const schedule = getRestockScheduleState({ expectedRestockDate: record?.expectedRestockDate, now });
  const orderByDate = calculateRestockOrderByDate(record?.expectedRestockDate, record?.leadTimeDays);
  const orderByMs = toUtcDateMs(orderByDate);
  const todayMs = toUtcDateMs(now);

  if (normalized === "overdue") return schedule.code === "overdue";
  if (normalized === "due_soon") return schedule.code === "due_today" || schedule.code === "due_soon";
  if (normalized === "order_now") return Number.isFinite(orderByMs) && Number.isFinite(todayMs) && orderByMs <= todayMs;
  if (normalized === "missing_supplier") return missing.includes("supplier");
  if (normalized === "missing_plan") return missing.length > 0;
  return true;
};
