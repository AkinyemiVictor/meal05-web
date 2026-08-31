import { normalizeCartItems } from "./cart-items.js";
import { reportCheckoutClientEvent } from "./checkout-telemetry.js";
import {
  getNetworkRequestMetadata,
  getRequestIdFromResponse,
} from "./fetch-with-network-retry.js";

const trimmedText = (value) => (typeof value === "string" ? value.trim() : "");

export const normalizeDeliveryAddress = (selectedAddress) => {
  if (typeof selectedAddress === "string") return selectedAddress.trim();
  if (!selectedAddress || typeof selectedAddress !== "object" || Array.isArray(selectedAddress)) return "";
  return trimmedText(
    selectedAddress.line ||
      selectedAddress.address ||
      selectedAddress.formattedAddress ||
      selectedAddress.formatted_address ||
      selectedAddress.street
  );
};

export const buildCheckoutOrderItems = (items) =>
  normalizeCartItems(items)
    .map((item) => {
      const productId = item.productId;
      const variantId = item.variantId;
      const payload = {
        quantity: item.quantity,
        unit_price_at_add: item.price,
      };
      if (productId != null && String(productId).trim()) payload.product_id = String(productId);
      if (variantId != null && String(variantId).trim()) payload.variant_id = String(variantId);
      if (item.variantName) payload.variant_name = item.variantName;
      if (item.productName || item.name) payload.product_name = item.productName || item.name;
      return payload;
    })
    .filter((item) => item.product_id || item.variant_id);

export const buildCheckoutOrderRequest = ({
  form,
  items,
  fulfillmentType = "delivery",
  pickupLocationId,
  deliveryPartnerId,
  deliveryLatitude,
  deliveryLongitude,
  paymentMethod,
  promoCode,
  preview = false,
}) => {
  const safeForm = form && typeof form === "object" ? form : {};
  const address = normalizeDeliveryAddress(safeForm.address ?? safeForm.deliveryAddress);
  const payload = {
    deliveryAddress: address,
    deliveryHouseNumber: trimmedText(safeForm.houseNumber ?? safeForm.deliveryHouseNumber),
    deliveryStreet: address,
    deliveryLandmark: trimmedText(safeForm.landmark ?? safeForm.deliveryLandmark),
    deliveryAddressLabel: trimmedText(safeForm.addressLabel ?? safeForm.deliveryAddressLabel) || "Home",
    deliveryContactName: trimmedText(safeForm.fullName ?? safeForm.deliveryContactName),
    deliveryContactPhone: trimmedText(safeForm.phone ?? safeForm.deliveryContactPhone),
    deliveryCity: trimmedText(safeForm.city ?? safeForm.deliveryCity),
    deliverySlot: trimmedText(safeForm.deliverySlot) || "delivery-24-hours",
    fulfillmentType: fulfillmentType === "pickup" ? "pickup" : "delivery",
    note: trimmedText(safeForm.notes ?? safeForm.note),
    paymentMethod: trimmedText(paymentMethod ?? safeForm.paymentMethod),
    items: buildCheckoutOrderItems(items),
  };

  if (preview) payload.preview = true;
  if (payload.fulfillmentType === "pickup") {
    const numericPickupId = Number(pickupLocationId);
    if (Number.isSafeInteger(numericPickupId) && numericPickupId > 0) payload.pickupLocationId = numericPickupId;
  } else {
    const latitude = Number(deliveryLatitude);
    const longitude = Number(deliveryLongitude);
    if (Number.isFinite(latitude)) payload.deliveryLatitude = latitude;
    if (Number.isFinite(longitude)) payload.deliveryLongitude = longitude;
    if (deliveryPartnerId != null && String(deliveryPartnerId).trim()) {
      payload.deliveryPartnerId = String(deliveryPartnerId).trim();
    }
  }
  if (promoCode && String(promoCode).trim()) payload.promo_code = String(promoCode).trim();

  return payload;
};

const issuePaths = (payload) =>
  (Array.isArray(payload?.issues) ? payload.issues : [])
    .map((issue) => (Array.isArray(issue?.path) ? issue.path.join(".") : String(issue?.path || "")))
    .filter(Boolean);

export const getCheckoutApiErrorMessage = (payload, fallback = "Unable to complete checkout.", response = null) => {
  const error = trimmedText(payload?.error);
  const message = trimmedText(payload?.message);
  const raw = message || error;
  const lower = raw.toLowerCase();
  const status = Number(response?.status) || 0;
  if (status === 408 || status === 504) {
    return "The checkout request timed out. Please check your connection and try again.";
  }
  if (status === 429) {
    return "Too many checkout attempts were made. Wait a moment, then try again.";
  }
  if (status >= 500) {
    return "The checkout service is temporarily unavailable. Please try again shortly.";
  }
  const paths = issuePaths(payload);

  if (paths.some((path) => /delivery(address|street|house|latitude|longitude)/i.test(path))) {
    return "Please select a valid delivery address.";
  }
  if (paths.some((path) => /^items(?:\.|$)/i.test(path))) {
    return "One of the selected items is no longer valid. Please review your cart.";
  }
  if (lower.includes("insufficient") && (lower.includes("wallet") || lower.includes("balance"))) {
    return "Payment unsuccessful. Insufficient wallet balance.";
  }
  if (lower.includes("not authenticated") || lower.includes("auth session") || lower.includes("login session")) {
    return "Your login session has expired. Please sign in again to continue checkout.";
  }
  if (lower.includes("out of stock") || lower.includes("no longer available")) {
    return "One of the selected items is no longer available. Please review your cart.";
  }
  if (
    payload?.code === "PAYMENT_METHOD_DISABLED" ||
    lower.includes("payment method is currently unavailable") ||
    lower.includes("unable to initialize") ||
    lower.includes("unable to prepare payment")
  ) {
    return "Payment could not be initialized. Please choose another option or try again.";
  }
  if (error === "Validation failed") {
    return "Please review your checkout details and try again.";
  }
  return raw || fallback;
};

export const logCheckoutApiError = (endpoint, response, payload, { stage = "checkout_request", durationMs = null } = {}) => {
  const metadata = getNetworkRequestMetadata(response);
  const requestId = getRequestIdFromResponse(response) || metadata?.requestId || "";
  reportCheckoutClientEvent({
    eventType: "http_error",
    endpoint,
    stage,
    requestId,
    status: response?.status,
    durationMs: durationMs ?? metadata?.durationMs ?? null,
    attempts: metadata?.attempts ?? null,
    cfRay: response?.headers?.get?.("CF-Ray") || "",
  });
  if (process.env.NODE_ENV !== "production") {
    console.error("Checkout API request failed", {
      endpoint,
      stage,
      requestId,
      status: response?.status,
      statusText: response?.statusText,
      payload,
    });
  }
};

export const logCheckoutNetworkError = (endpoint, error, { stage = "checkout_request" } = {}) => {
  reportCheckoutClientEvent({
    eventType: "network_error",
    endpoint,
    stage,
    requestId: error?.requestId,
    errorCode: error?.code,
    durationMs: error?.durationMs,
    attempts: error?.attempts,
  });
  if (process.env.NODE_ENV !== "production") {
    console.error("Checkout network request failed", {
      endpoint,
      stage,
      requestId: error?.requestId,
      code: error?.code,
      durationMs: error?.durationMs,
      attempts: error?.attempts,
    });
  }
};
