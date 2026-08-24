import { deriveAvailabilityRequestLifecycle } from "./availability-request-state.js";

const PRESENTATIONS = Object.freeze({
  awaiting_confirmation: Object.freeze({
    label: "Checking availability",
    title: "We’re checking your basket",
    description: "Requested items are being confirmed with the market or supplier. You can leave this page and come back later.",
    tone: "checking",
  }),
  confirmation_overdue: Object.freeze({
    label: "Taking longer than expected",
    title: "Your request is still active",
    description: "The expected confirmation time has passed, but we’re still checking the requested items. No payment has been taken.",
    tone: "warning",
  }),
  confirmation_deadline_missing: Object.freeze({
    label: "Checking availability",
    title: "We’re checking your basket",
    description: "Requested items are being confirmed. No payment has been taken yet.",
    tone: "checking",
  }),
  action_required: Object.freeze({
    label: "Action needed",
    title: "One or more items need your attention",
    description: "An item could not be confirmed. Remove unavailable items to continue with the rest of the basket.",
    tone: "warning",
  }),
  ready_for_payment: Object.freeze({
    label: "Ready for payment",
    title: "Your basket is confirmed",
    description: "The availability check is complete. Continue to payment before the payment window closes.",
    tone: "success",
  }),
  payment_deadline_missing: Object.freeze({
    label: "Payment needs attention",
    title: "Your basket is confirmed",
    description: "The basket is confirmed, but the payment deadline is unavailable. Please refresh before continuing.",
    tone: "warning",
  }),
  payment_expired: Object.freeze({
    label: "Payment window expired",
    title: "The payment window has closed",
    description: "The confirmed availability can no longer be guaranteed. Return eligible items to your cart if you still want them.",
    tone: "neutral",
  }),
  expired: Object.freeze({
    label: "Payment window expired",
    title: "The payment window has closed",
    description: "The confirmed availability can no longer be guaranteed. Return eligible items to your cart if you still want them.",
    tone: "neutral",
  }),
  converted: Object.freeze({
    label: "Order created",
    title: "This request became an order",
    description: "The availability request is complete and the confirmed basket has been moved into your orders.",
    tone: "success",
  }),
  cancelled: Object.freeze({
    label: "Cancelled",
    title: "This request was cancelled",
    description: "No further availability checks or payment actions will be taken for this request.",
    tone: "neutral",
  }),
  unknown: Object.freeze({
    label: "Request update",
    title: "Availability request",
    description: "Open this request for its latest availability status.",
    tone: "neutral",
  }),
});

const itemPresentations = Object.freeze({
  not_required: Object.freeze({ label: "Ready", detail: "No availability check needed", tone: "success" }),
  pending: Object.freeze({ label: "Checking", detail: "Availability is being confirmed", tone: "checking" }),
  confirmed: Object.freeze({ label: "Confirmed", detail: "Availability confirmed", tone: "success" }),
  unavailable: Object.freeze({ label: "Unavailable", detail: "Could not be confirmed", tone: "warning" }),
});

const buildProgress = (phase) => {
  const availabilityComplete = ["ready_for_payment", "payment_deadline_missing", "payment_expired", "expired", "converted"].includes(phase);
  const availabilityAttention = phase === "action_required" || phase === "confirmation_overdue";
  const paymentComplete = phase === "converted";
  const paymentActive = phase === "ready_for_payment" || phase === "payment_deadline_missing";
  const paymentExpired = phase === "payment_expired" || phase === "expired";
  const cancelled = phase === "cancelled";

  return [
    { key: "submitted", label: "Request submitted", state: "complete" },
    {
      key: "availability",
      label: "Availability check",
      state: cancelled ? "stopped" : availabilityComplete ? "complete" : availabilityAttention ? "attention" : "active",
    },
    {
      key: "payment",
      label: "Payment",
      state: paymentComplete ? "complete" : paymentExpired ? "expired" : paymentActive ? "active" : cancelled ? "stopped" : "pending",
    },
  ];
};

export const getAvailabilityRequestPresentation = (request, now = new Date()) => {
  const lifecycle = deriveAvailabilityRequestLifecycle(request, now);
  const phase = lifecycle.phase || "unknown";
  const presentation = PRESENTATIONS[phase] || PRESENTATIONS.unknown;
  return {
    ...presentation,
    phase,
    lifecycle,
    progress: buildProgress(phase),
  };
};

export const getAvailabilityItemPresentation = (item) => {
  const status = String(item?.resolution_status || "").trim().toLowerCase();
  return itemPresentations[status] || { label: "Pending", detail: "Waiting for an update", tone: "neutral" };
};

export const isAvailabilityRequestLive = (request) =>
  !["converted", "cancelled", "expired"].includes(String(request?.status || "").trim().toLowerCase());
