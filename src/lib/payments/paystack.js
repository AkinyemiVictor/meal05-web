import "server-only";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export const normaliseText = (value) => String(value ?? "").trim();

export const resolvePaystackSecret = () => normaliseText(process.env.PAYSTACK_SECRET_KEY);

export const toPaystackSubunit = (amount) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 100);
};

export const resolvePaystackCustomerEmail = (user) => {
  const email = normaliseText(user?.email).toLowerCase();
  if (email) return email;
  const userId = normaliseText(user?.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  return `customer-${userId || "unknown"}@customers.meal05.com`;
};

export const initialisePaystackTransaction = async ({
  secret,
  email,
  amountKobo,
  reference,
  currency,
  callbackUrl,
  metadata,
}) => {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountKobo,
      reference,
      currency,
      callback_url: callbackUrl || undefined,
      metadata,
    }),
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.status !== true || !payload?.data?.authorization_url) {
    throw new Error(normaliseText(payload?.message) || "Unable to initialize Paystack payment.");
  }
  return payload.data;
};

export const verifyPaystackTransaction = async (reference, secret) => {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  const tx = payload?.data || {};
  const isSuccess = Boolean(payload?.status) && tx?.status === "success";
  return {
    ok: isSuccess,
    statusCode: res.status,
    payload,
    tx,
    error: isSuccess ? null : normaliseText(payload?.message || "Verification failed"),
  };
};
