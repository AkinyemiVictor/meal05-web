const normaliseMethod = (value) => String(value || "").trim().toLowerCase();

export const isPaystackEnabled = () => /^pk_(test|live)_/.test(process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "");

export const isPalmPayEnabled = () => process.env.NEXT_PUBLIC_ENABLE_PALMPAY === "true";

export const isOpayEnabled = () => process.env.NEXT_PUBLIC_ENABLE_OPAY === "true";

export const isWalletPaymentVisible = () => process.env.NEXT_PUBLIC_ENABLE_MEAL05_BALANCE === "true";

export const isCheckoutPaymentMethodEnabled = (method) => {
  switch (normaliseMethod(method)) {
    case "paystack":
      return isPaystackEnabled();
    case "palmpay":
      return isPalmPayEnabled();
    case "opay":
      return isOpayEnabled();
    case "wallet":
      return isWalletPaymentVisible();
    default:
      return false;
  }
};
