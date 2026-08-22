import { buildWhatsappUrl, normalizePhoneContact } from "../phone-links.js";

const normalizeStatus = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

export const ACTIVE_ROUTE_STATUSES = new Set(["in_progress", "started", "out_for_delivery", "active"]);
export const TERMINAL_ROUTE_STATUSES = new Set(["completed", "cancelled", "canceled", "failed", "returned"]);
export const ACTIVE_STOP_STATUSES = new Set(["next", "en_route", "arrived"]);
export const TERMINAL_STOP_STATUSES = new Set(["delivered", "completed", "cancelled", "canceled", "failed", "returned", "skipped"]);
export const ACTIVE_ORDER_DELIVERY_STATUSES = new Set(["out_for_delivery", "rider_approaching", "in_transit", "dispatched"]);
export const TERMINAL_ORDER_STATUSES = new Set(["delivered", "completed", "cancelled", "canceled", "failed", "returned", "refunded"]);

export const RIDER_TO_CUSTOMER_NOTE =
  "Call or WhatsApp only for delivery coordination. Contact Meal05 support for payment, refund, product or complaint issues.";

const routeStarted = (route) => Boolean(route?.actual_start_time || ACTIVE_ROUTE_STATUSES.has(normalizeStatus(route?.status)));

export const formatPublicRiderName = (value) => {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Meal05 rider";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1).toUpperCase()}.`;
};

export function canShowRiderCustomerContact({ route, stop } = {}) {
  if (!routeStarted(route)) return false;
  if (TERMINAL_ROUTE_STATUSES.has(normalizeStatus(route?.status))) return false;
  if (TERMINAL_STOP_STATUSES.has(normalizeStatus(stop?.status))) return false;
  return ACTIVE_STOP_STATUSES.has(normalizeStatus(stop?.status));
}

export function canShowCustomerRiderContact({ order, route, stop } = {}) {
  const orderStatus = normalizeStatus(order?.status);
  const deliveryStatus = normalizeStatus(order?.delivery_status || order?.deliveryStatus);
  if (TERMINAL_ORDER_STATUSES.has(orderStatus) || TERMINAL_ORDER_STATUSES.has(deliveryStatus)) return false;
  if (!ACTIVE_ORDER_DELIVERY_STATUSES.has(deliveryStatus)) return false;
  return canShowRiderCustomerContact({ route, stop });
}

export function buildRiderCustomerContact({ route, stop } = {}) {
  if (!canShowRiderCustomerContact({ route, stop })) return { available: false };
  const phone = normalizePhoneContact(stop?.customer_phone);
  if (!phone) return { available: false };
  const customerName = String(stop?.customer_name || "there").trim();
  const orderReference = stop?.orders?.order_reference || stop?.order_reference || stop?.order_id || "your order";
  const message = `Hello ${customerName}, I'm the Meal05 rider delivering order #${orderReference}. I'm contacting you regarding your delivery.`;
  return {
    available: true,
    phone: phone.displayPhone,
    callUrl: phone.callUrl,
    whatsappUrl: buildWhatsappUrl(phone.whatsappNumber, message),
    note: RIDER_TO_CUSTOMER_NOTE,
  };
}

export function buildCustomerRiderContact({ order, stop } = {}) {
  const route = stop?.delivery_routes || stop?.route || stop?.routeData;
  if (!canShowCustomerRiderContact({ order, route, stop })) return { available: false };
  const partner = Array.isArray(route?.delivery_partners) ? route.delivery_partners[0] : route?.delivery_partners;
  if (!partner) return { available: false };
  const phone = normalizePhoneContact(partner.phone || partner.contact_phone);
  if (!phone) return { available: false };
  const orderReference = order?.order_reference || order?.orderReference || order?.id || "your order";
  const message = `Hello, I'm contacting you about my Meal05 order #${orderReference}. My delivery is currently on the way.`;
  return {
    available: true,
    rider: {
      name: formatPublicRiderName(partner.full_name || partner.name),
      phone: phone.displayPhone,
      callUrl: phone.callUrl,
      whatsappUrl: buildWhatsappUrl(phone.whatsappNumber, message),
      riderCode: partner.rider_code || "",
      vehicleType: partner.vehicle_type || route?.vehicle_type || "",
      vehicleNumber: partner.vehicle_plate_number || "",
    },
    note: RIDER_TO_CUSTOMER_NOTE,
  };
}
