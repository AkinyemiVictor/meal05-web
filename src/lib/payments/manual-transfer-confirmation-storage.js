const STORAGE_KEY = "meal05_manual_transfer_confirmation";

const normalizeText = (value) => String(value ?? "").trim();

const normalizeContext = (value) => {
  if (!value || typeof value !== "object") return null;

  const providerCode = normalizeText(value.providerCode);
  const paymentId = normalizeText(value.paymentId);
  const amount = Number(value.amount);
  if (!providerCode || !paymentId || !Number.isFinite(amount) || amount <= 0) return null;

  return {
    providerCode,
    paymentId,
    amount,
    currency: normalizeText(value.currency || "NGN").toUpperCase(),
    orderId: normalizeText(value.orderId),
    defaultPayerAccountName: normalizeText(value.defaultPayerAccountName),
  };
};

export const persistManualTransferConfirmation = (value) => {
  if (typeof window === "undefined") return false;
  const context = normalizeContext(value);
  if (!context) return false;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    return true;
  } catch (error) {
    console.warn("Unable to persist manual transfer confirmation", error);
    return false;
  }
};

export const readManualTransferConfirmation = () => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? normalizeContext(JSON.parse(raw)) : null;
  } catch (error) {
    console.warn("Unable to read manual transfer confirmation", error);
    return null;
  }
};

export const clearManualTransferConfirmation = () => {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to clear manual transfer confirmation", error);
  }
};
