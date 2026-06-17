"use client";

const DEFAULT_CURRENCY = "NGN";

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const roundToTwo = (value) => Math.round(toNumber(value) * 100) / 100;

const normaliseString = (value) => {
  if (value == null) return "";
  return String(value).trim();
};

const getItemQuantity = (item) => {
  const orderSize = toNumber(item?.orderSize);
  const orderCount = toNumber(item?.orderCount);
  if (orderSize > 0 && orderCount > 0) {
    return roundToTwo(orderSize * orderCount);
  }

  const quantity = toNumber(item?.quantity);
  if (quantity > 0) return roundToTwo(quantity);
  if (orderCount > 0) return roundToTwo(orderCount);
  return 1;
};

export const toAnalyticsItem = (item) => {
  if (!item || typeof item !== "object") return null;

  const itemId =
    normaliseString(item.variantId) ||
    normaliseString(item.productId) ||
    normaliseString(item.id);
  const itemName = normaliseString(item.name) || itemId;

  if (!itemId && !itemName) return null;

  const analyticsItem = {
    item_id: itemId || itemName,
    item_name: itemName,
    quantity: getItemQuantity(item),
  };

  const price = toNumber(item.unit_price_at_add ?? item.price ?? item.unitPrice);
  if (price > 0) {
    analyticsItem.price = roundToTwo(price);
  }

  const category = normaliseString(item.category);
  if (category) {
    analyticsItem.item_category = category;
  }

  const variant = normaliseString(
    item.variantName ??
      item.variant_name ??
      item.sizeLabel ??
      item.size ??
      item.ripeness
  );
  if (variant) {
    analyticsItem.item_variant = variant;
  }

  return analyticsItem;
};

export const toAnalyticsItems = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => toAnalyticsItem(item))
    .filter(Boolean);

const computeItemsValue = (items) =>
  roundToTwo(
    items.reduce((sum, item) => {
      const price = toNumber(item?.price);
      const quantity = toNumber(item?.quantity);
      return sum + price * quantity;
    }, 0)
  );

const resolveCurrency = (currency) => normaliseString(currency) || DEFAULT_CURRENCY;

export const trackEvent = (eventName, params = {}) => {
  if (typeof window === "undefined") return;
  if (!normaliseString(eventName)) return;

  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: eventName, ...params });
  } catch (error) {
    console.warn(`Unable to track analytics event "${eventName}"`, error);
  }
};

export const trackViewItem = (item, options = {}) => {
  const mapped = toAnalyticsItem(item);
  if (!mapped) return;

  const payload = {
    currency: resolveCurrency(options.currency),
    items: [mapped],
  };

  const value = toNumber(options.value || mapped.price);
  if (value > 0) {
    payload.value = roundToTwo(value);
  }

  trackEvent("view_item", payload);
};

export const trackAddToCart = (items, options = {}) => {
  const mappedItems = toAnalyticsItems(items);
  if (!mappedItems.length) return;

  const payload = {
    currency: resolveCurrency(options.currency),
    items: mappedItems,
  };

  const explicitValue = toNumber(options.value);
  const computedValue = computeItemsValue(mappedItems);
  if (explicitValue > 0 || computedValue > 0) {
    payload.value = roundToTwo(explicitValue || computedValue);
  }

  trackEvent("add_to_cart", payload);
};

export const trackBeginCheckout = (items, options = {}) => {
  const mappedItems = toAnalyticsItems(items);
  if (!mappedItems.length) return;

  const payload = {
    currency: resolveCurrency(options.currency),
    items: mappedItems,
  };

  const explicitValue = toNumber(options.value);
  const computedValue = computeItemsValue(mappedItems);
  if (explicitValue > 0 || computedValue > 0) {
    payload.value = roundToTwo(explicitValue || computedValue);
  }

  if (normaliseString(options.coupon)) {
    payload.coupon = normaliseString(options.coupon);
  }

  trackEvent("begin_checkout", payload);
};

export const trackPurchase = ({
  transactionId,
  items,
  value,
  shipping,
  tax,
  coupon,
  currency,
  paymentType,
} = {}) => {
  const txId = normaliseString(transactionId);
  if (!txId) return;

  const mappedItems = toAnalyticsItems(items);
  const payload = {
    transaction_id: txId,
    affiliation: "Meal05 Web",
    currency: resolveCurrency(currency),
    items: mappedItems,
  };

  const explicitValue = toNumber(value);
  const computedValue = computeItemsValue(mappedItems);
  if (explicitValue > 0 || computedValue > 0) {
    payload.value = roundToTwo(explicitValue || computedValue);
  }

  const shippingValue = toNumber(shipping);
  if (shippingValue > 0) {
    payload.shipping = roundToTwo(shippingValue);
  }

  const taxValue = toNumber(tax);
  if (taxValue > 0) {
    payload.tax = roundToTwo(taxValue);
  }

  const couponCode = normaliseString(coupon);
  if (couponCode) {
    payload.coupon = couponCode;
  }

  const method = normaliseString(paymentType);
  if (method) {
    payload.payment_type = method;
  }

  trackEvent("purchase", payload);
};
