import {
  DEFAULT_DELIVERY_FEE,
  DEFAULT_FREE_DELIVERY_THRESHOLD,
} from "@/lib/delivery-settings";
import { computePackagingFee } from "@/lib/packaging-fees";
import { roundQuantity } from "@/lib/purchase-quantities";

export { DEFAULT_FREE_DELIVERY_THRESHOLD, DEFAULT_DELIVERY_FEE };
export const MINIMUM_ORDER_FEE_THRESHOLD = 5000;
export const MINIMUM_ORDER_HANDLING_FEE = 1000;

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
    return Math.max(0, roundQuantity(orderSize * orderCount));
  }

  const quantity = toNumber(item.quantity ?? item.qty, 0);
  if (quantity > 0) return Math.max(0, roundQuantity(quantity));

  if (orderCount > 0) return Math.max(0, roundQuantity(orderCount));
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
    minimumOrderFeeThreshold = MINIMUM_ORDER_FEE_THRESHOLD,
    minimumOrderHandlingFee = MINIMUM_ORDER_HANDLING_FEE,
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
  // Global low-order handling fee. Keep these constants near the pricing rule
  // so finance can adjust the threshold/fee without adding a settings table yet.
  const handlingFee =
    aggregates.itemsCount > 0 && subtotal > 0 && subtotal < Math.max(0, toNumber(minimumOrderFeeThreshold, MINIMUM_ORDER_FEE_THRESHOLD))
      ? roundMoney(minimumOrderHandlingFee)
      : 0;

  return {
    itemsCount: Math.max(0, roundQuantity(aggregates.itemsCount)),
    subtotal,
    packagingFee: normalizedPackaging,
    handlingFee,
    deliveryFee: normalizedDelivery,
    itemDiscount: 0,
    deliveryDiscount: 0,
    discountTotal: 0,
    discount: 0,
    total: subtotal + normalizedPackaging + handlingFee + normalizedDelivery,
    promoCode: "",
    promoDescription: "",
    promo: null,
  };
};

export const applyPromoToOrderSummary = (summary, promoState) => {
  const base = {
    itemsCount: Math.max(0, roundQuantity(summary?.itemsCount)),
    subtotal: roundMoney(summary?.subtotal),
    packagingFee: roundMoney(summary?.packagingFee),
    handlingFee: roundMoney(summary?.handlingFee),
    deliveryFee: roundMoney(summary?.deliveryFee),
    itemDiscount: 0,
    deliveryDiscount: 0,
    discountTotal: 0,
    discount: 0,
    total:
      roundMoney(summary?.subtotal) +
      roundMoney(summary?.packagingFee) +
      roundMoney(summary?.handlingFee) +
      roundMoney(summary?.deliveryFee),
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
    total: Math.max(0, base.subtotal + base.packagingFee + base.handlingFee + base.deliveryFee - discountTotal),
    promoCode: String(promoState?.promo?.code || promoState?.code || "").trim().toUpperCase(),
    promoDescription: String(promoState?.message || promoState?.promo?.description || "").trim(),
    promo: promoState?.promo || null,
  };
};

const orderPricing = {
  DEFAULT_FREE_DELIVERY_THRESHOLD,
  DEFAULT_DELIVERY_FEE,
  MINIMUM_ORDER_FEE_THRESHOLD,
  MINIMUM_ORDER_HANDLING_FEE,
  computeOrderSummary,
  applyPromoToOrderSummary,
};

export default orderPricing;
