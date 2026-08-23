const CONFIRMATION_ACTIVE_STATUSES = new Set(["pending", "checking"]);
const TERMINAL_STATUSES = new Set(["converted", "cancelled", "expired"]);

const toTimestamp = (value) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const toNowTimestamp = (value) => {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value || Date.now()).getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
};

export const deriveAvailabilityRequestLifecycle = (request, now = new Date()) => {
  const status = String(request?.status || "").trim().toLowerCase();
  const nowTimestamp = toNowTimestamp(now);
  const confirmationDeadline = toTimestamp(request?.confirmation_deadline_at);
  const paymentDeadline = toTimestamp(request?.payment_expires_at);
  const awaitingConfirmation = CONFIRMATION_ACTIVE_STATUSES.has(status);
  const confirmationSlaExceeded = Boolean(
    awaitingConfirmation && confirmationDeadline != null && nowTimestamp >= confirmationDeadline
  );
  const paymentWindowExpired = Boolean(
    status === "confirmed" && paymentDeadline != null && nowTimestamp >= paymentDeadline
  );

  let phase = "unknown";
  if (awaitingConfirmation) {
    if (confirmationDeadline == null) phase = "confirmation_deadline_missing";
    else phase = confirmationSlaExceeded ? "confirmation_overdue" : "awaiting_confirmation";
  } else if (status === "action_required") {
    phase = "action_required";
  } else if (status === "confirmed") {
    if (paymentDeadline == null) phase = "payment_deadline_missing";
    else phase = paymentWindowExpired ? "payment_expired" : "ready_for_payment";
  } else if (TERMINAL_STATUSES.has(status)) {
    phase = status;
  }

  return {
    phase,
    confirmationSlaExceeded,
    paymentWindowExpired,
    confirmationDeadlineMissing: awaitingConfirmation && confirmationDeadline == null,
    paymentDeadlineMissing: status === "confirmed" && paymentDeadline == null,
    isTerminal: TERMINAL_STATUSES.has(status),
  };
};

export const attachAvailabilityRequestLifecycle = (request, now = new Date()) => {
  if (!request || typeof request !== "object") return request;
  return {
    ...request,
    lifecycle: deriveAvailabilityRequestLifecycle(request, now),
  };
};

export const availabilityRequestStateConstants = Object.freeze({
  confirmationActiveStatuses: Object.freeze([...CONFIRMATION_ACTIVE_STATUSES]),
  terminalStatuses: Object.freeze([...TERMINAL_STATUSES]),
});
