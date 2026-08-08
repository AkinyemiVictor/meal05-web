import { normalizeCartItems } from "./cart-items.js";

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

export const getCheckoutApiErrorMessage = (payload, fallback = "Unable to complete checkout.") => {
  const error = trimmedText(payload?.error);
  const message = trimmedText(payload?.message);
  const raw = message || error;
  const lower = raw.toLowerCase();
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

export const logCheckoutApiError = (endpoint, response, payload) => {
  if (process.env.NODE_ENV === "production") return;
  console.error("Checkout API request failed", {
    endpoint,
    status: response?.status,
    statusText: response?.statusText,
    payload,
  });
};

