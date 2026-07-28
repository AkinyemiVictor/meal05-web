const normaliseMethod = (value) => String(value || "").trim().toLowerCase();

export const isPaystackEnabled = () => /^pk_(test|live)_/.test(process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "");

export const isPalmPayEnabled = () => process.env.NEXT_PUBLIC_ENABLE_PALMPAY === "true";

export const isOpayEnabled = () => true;

export const isWalletPaymentVisible = () => true;

export const isMoniepointTransferEnabled = () => true;

export const isCheckoutPaymentMethodEnabled = (method) => {
  switch (normaliseMethod(method)) {
    case "paystack":
      return false;
    case "moniepoint_transfer":
    case "bank_transfer":
      return isMoniepointTransferEnabled();
    case "palmpay":
      return isPalmPayEnabled();
    case "opay":
    case "opay_transfer":
      return isOpayEnabled();
    case "wallet":
      return isWalletPaymentVisible();
    default:
      return false;
  }
};
