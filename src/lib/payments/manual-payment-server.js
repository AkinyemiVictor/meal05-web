import "server-only";

export const PAYMENT_EXPIRED_CODE = "PAYMENT_EXPIRED";
export const PAYMENT_EXPIRED_MESSAGE = "This payment request has expired. Start a new payment to continue.";

export const expireManualPaymentIfNeeded = async (admin, paymentId, expectedUserId = null) => {
  const { data, error } = await admin.rpc("expire_manual_payment_if_needed", {
    p_payment_id: Number(paymentId),
    p_expected_user_id: expectedUserId || null,
  });
  if (error) throw error;
  return data || { expired: false };
};

export const isExpiredPaymentResult = (result) =>
  result?.expired === true || result?.code === PAYMENT_EXPIRED_CODE;

