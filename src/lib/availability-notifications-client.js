"use client";

import { getAvailabilityRequestPresentation } from "./availability-request-presenter.js";
import { addNotification, readNotifications } from "@/lib/notifications";

const ACTIONABLE_PHASES = new Set(["action_required", "ready_for_payment"]);

export const buildAvailabilityRequestNotification = (request, now = new Date()) => {
  if (!request?.id) return null;
  const presentation = getAvailabilityRequestPresentation(request, now);
  if (!ACTIONABLE_PHASES.has(presentation.phase)) return null;

  const requestNumber = String(request.request_number || "Availability request");
  const readyForPayment = presentation.phase === "ready_for_payment";
  return {
    id: `availability-${request.id}-${presentation.phase}`,
    type: readyForPayment ? "success" : "system",
    title: readyForPayment ? "Basket ready for payment" : "Basket needs your attention",
    body: readyForPayment
      ? `${requestNumber} is confirmed. Open it to complete payment before the availability window closes.`
      : `${requestNumber} has an item we could not confirm. Review it to continue with the rest of your basket.`,
    href: `/availability-requests/${request.id}`,
    createdAt: request.updated_at || request.confirmed_at || request.created_at || new Date().toISOString(),
    read: false,
    meta: { availabilityRequestId: request.id, phase: presentation.phase },
  };
};

export const syncAvailabilityRequestNotifications = ({ requests = [], user, now = new Date() } = {}) => {
  const current = readNotifications(user);
  const existingIds = new Set(current.map((notification) => notification.id));
  let added = false;

  (Array.isArray(requests) ? requests : []).forEach((request) => {
    const notification = buildAvailabilityRequestNotification(request, now);
    if (!notification || existingIds.has(notification.id)) return;
    addNotification(notification, user);
    existingIds.add(notification.id);
    added = true;
  });

  return added ? readNotifications(user) : current;
};
