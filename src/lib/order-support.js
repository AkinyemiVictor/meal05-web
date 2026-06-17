export const ORDER_SUPPORT_CASE_TYPES = Object.freeze([
  { value: "refund", label: "Refund" },
  { value: "replacement", label: "Replacement" },
  { value: "return", label: "Return" },
]);

export const ORDER_SUPPORT_CASE_STATUSES = Object.freeze([
  { value: "open", label: "Open" },
  { value: "reviewing", label: "Reviewing" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "resolved", label: "Resolved" },
  { value: "cancelled", label: "Cancelled" },
]);

const TYPE_LOOKUP = new Map(ORDER_SUPPORT_CASE_TYPES.map((option) => [option.value, option]));
const STATUS_LOOKUP = new Map(ORDER_SUPPORT_CASE_STATUSES.map((option) => [option.value, option]));
const CLOSED_STATUSES = new Set(["rejected", "resolved", "cancelled"]);

export const normalizeOrderSupportCaseType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return TYPE_LOOKUP.has(normalized) ? normalized : "refund";
};

export const normalizeOrderSupportCaseStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return STATUS_LOOKUP.has(normalized) ? normalized : "open";
};

export const isOrderSupportCaseType = (value) =>
  TYPE_LOOKUP.has(String(value || "").trim().toLowerCase());

export const isOrderSupportCaseStatus = (value) =>
  STATUS_LOOKUP.has(String(value || "").trim().toLowerCase());

export const getOrderSupportCaseTypeLabel = (value) =>
  TYPE_LOOKUP.get(normalizeOrderSupportCaseType(value))?.label || "Refund";

export const getOrderSupportCaseStatusLabel = (value) =>
  STATUS_LOOKUP.get(normalizeOrderSupportCaseStatus(value))?.label || "Open";

export const isClosedOrderSupportCaseStatus = (value) =>
  CLOSED_STATUSES.has(normalizeOrderSupportCaseStatus(value));
