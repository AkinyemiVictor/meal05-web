import {
  DEFAULT_DELIVERY_FEE,
  DEFAULT_FREE_DELIVERY_THRESHOLD,
} from "@/lib/delivery-settings";
import { computePackagingFee } from "@/lib/packaging-fees";

export { DEFAULT_FREE_DELIVERY_THRESHOLD, DEFAULT_DELIVERY_FEE };

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundMoney = (value) => Math.max(0, Math.round(toNumber(value, 0)));

const getOrderItemQuantity = (item) => {
  if (!item || typeof item !== "object") return 0;

  const orderSize = toNumber(item.orderSize, 0);
  const orderCount = toNumber(item.orderCount, 0);
  if (orderSize > 0 && orderCount > 0) {
    return Math.max(0, Math.round(orderSize * orderCount));
  }

  const quantity = toNumber(item.quantity ?? item.qty, 0);
  if (quantity > 0) return Math.max(0, Math.round(quantity));

  if (orderCount > 0) return Math.max(0, Math.round(orderCount));
  return 0;
};

const getOrderItemPrice = (item) => {
  if (!item || typeof item !== "object") return 0;
  return Math.max(0, toNumber(item.unit_price_at_add ?? item.unitPrice ?? item.price, 0));
};

export const computeOrderSummary = (
  items,
  {
    freeDeliveryThreshold = DEFAULT_FREE_DELIVERY_THRESHOLD,
    deliveryFee = DEFAULT_DELIVERY_FEE,
    packagingFee = null,
  } = {}
) => {
  const aggregates = (Array.isArray(items) ? items : []).reduce(
    (acc, item) => {
      const quantity = getOrderItemQuantity(item);
      const price = getOrderItemPrice(item);
      return {
        itemsCount: acc.itemsCount + quantity,
        subtotal: acc.subtotal + price * quantity,
      };
    },
    { itemsCount: 0, subtotal: 0 }
  );

  const subtotal = roundMoney(aggregates.subtotal);
  const threshold = Math.max(0, toNumber(freeDeliveryThreshold, DEFAULT_FREE_DELIVERY_THRESHOLD));
  const normalizedDelivery =
    aggregates.itemsCount > 0 && subtotal < threshold
      ? roundMoney(deliveryFee)
      : 0;
  const normalizedPackaging =
    packagingFee == null
      ? computePackagingFee(items).packagingFee
      : roundMoney(packagingFee);

  return {
    itemsCount: Math.max(0, Math.round(aggregates.itemsCount)),
    subtotal,
    packagingFee: normalizedPackaging,
    deliveryFee: normalizedDelivery,
    itemDiscount: 0,
    deliveryDiscount: 0,
    discountTotal: 0,
    discount: 0,
    total: subtotal + normalizedPackaging + normalizedDelivery,
    promoCode: "",
    promoDescription: "",
    promo: null,
  };
};

export const applyPromoToOrderSummary = (summary, promoState) => {
  const base = {
    itemsCount: Math.max(0, Math.round(toNumber(summary?.itemsCount, 0))),
    subtotal: roundMoney(summary?.subtotal),
    packagingFee: roundMoney(summary?.packagingFee),
    deliveryFee: roundMoney(summary?.deliveryFee),
    itemDiscount: 0,
    deliveryDiscount: 0,
    discountTotal: 0,
    discount: 0,
    total: roundMoney(summary?.subtotal) + roundMoney(summary?.packagingFee) + roundMoney(summary?.deliveryFee),
    promoCode: "",
    promoDescription: "",
    promo: null,
  };

  if (!promoState || typeof promoState !== "object") {
    return base;
  }

  const itemDiscount = Math.min(base.subtotal, roundMoney(promoState?.totals?.itemDiscount));
  const deliveryDiscount = Math.min(base.deliveryFee, roundMoney(promoState?.totals?.deliveryDiscount));
  const discountTotal = Math.min(base.subtotal + base.deliveryFee, itemDiscount + deliveryDiscount);

  return {
    ...base,
    itemDiscount,
    deliveryDiscount,
    discountTotal,
    discount: discountTotal,
    total: Math.max(0, base.subtotal + base.packagingFee + base.deliveryFee - discountTotal),
    promoCode: String(promoState?.promo?.code || promoState?.code || "").trim().toUpperCase(),
    promoDescription: String(promoState?.message || promoState?.promo?.description || "").trim(),
    promo: promoState?.promo || null,
  };
};

const orderPricing = {
  DEFAULT_FREE_DELIVERY_THRESHOLD,
  DEFAULT_DELIVERY_FEE,
  computeOrderSummary,
  applyPromoToOrderSummary,
};

export default orderPricing;
