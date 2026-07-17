import crypto from "node:crypto";

const IDEMPOTENCY_KEY_MAX_LENGTH = 200;
const UUID_OR_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

export const normalizeIdempotencyKey = (value) => {
  const key = String(value || "").trim();
  if (!key) return null;
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH || !UUID_OR_TOKEN_PATTERN.test(key)) {
    return { error: "Invalid Idempotency-Key header." };
  }
  return { key };
};

const normalizeValue = (value) => {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!value || typeof value !== "object") return value ?? null;

  return Object.keys(value)
    .sort()
    .reduce((accumulator, key) => {
      const next = normalizeValue(value[key]);
      if (next !== undefined) accumulator[key] = next;
      return accumulator;
    }, {});
};

export const stableStringify = (value) => JSON.stringify(normalizeValue(value));

const normalizeOrderItemForFingerprint = (item) => ({
  product_id: item?.product_id != null ? String(item.product_id) : null,
  variant_id: item?.variant_id != null ? String(item.variant_id) : null,
  quantity: Number(item?.quantity || 0),
});

export const buildOrderRequestFingerprint = (payload) => {
  const intent = {
    deliveryAddress: payload?.deliveryAddress || "",
    deliveryAddressLabel: payload?.deliveryAddressLabel || "",
    deliveryCity: payload?.deliveryCity || "",
    deliveryContactName: payload?.deliveryContactName || "",
    deliveryContactPhone: payload?.deliveryContactPhone || "",
    deliveryHouseNumber: payload?.deliveryHouseNumber || "",
    deliveryLandmark: payload?.deliveryLandmark || "",
    deliveryLatitude: payload?.deliveryLatitude ?? null,
    deliveryLongitude: payload?.deliveryLongitude ?? null,
    deliveryPartnerId: payload?.deliveryPartnerId || null,
    deliveryStreet: payload?.deliveryStreet || "",
    fulfillmentType: payload?.fulfillmentType || "delivery",
    items: Array.isArray(payload?.items) ? payload.items.map(normalizeOrderItemForFingerprint) : [],
    note: payload?.note || "",
    paymentMethod: payload?.paymentMethod || "paystack",
    pickupLocationId: payload?.pickupLocationId ?? null,
    promo_code: payload?.promo_code || "",
  };

  return crypto.createHash("sha256").update(stableStringify(intent)).digest("hex");
};

const isUniqueViolation = (error) => error?.code === "23505" || /duplicate key/i.test(String(error?.message || ""));

const fetchExistingRecord = async (admin, { userId, key }) => {
  const { data, error } = await admin
    .from("order_idempotency_keys")
    .select("id, request_fingerprint, order_id, status, response_status, response_body")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

export const classifyExistingIdempotencyRecord = (record, fingerprint) => {
  if (!record) return { kind: "missing" };
  if (record.request_fingerprint && record.request_fingerprint !== fingerprint) {
    return {
      kind: "conflict",
      status: 409,
      body: { error: "Idempotency key was reused with different order data." },
    };
  }
  if (record.status === "completed" && record.response_body) {
    return {
      kind: "replay",
      status: Number(record.response_status || 201),
      body: record.response_body,
    };
  }
  if (record.status === "processing") {
    return {
      kind: "processing",
      status: 409,
      body: { error: "An order request with this idempotency key is still processing. Retry the same request shortly." },
    };
  }
  return { kind: "retryable_failed", record };
};

export const checkExistingOrderIdempotency = async (admin, { userId, key, fingerprint }) => {
  const record = await fetchExistingRecord(admin, { userId, key });
  return classifyExistingIdempotencyRecord(record, fingerprint);
};

export const reserveOrderIdempotencyKey = async (admin, { userId, key, fingerprint }) => {
  const { data, error } = await admin
    .from("order_idempotency_keys")
    .insert({
      user_id: userId,
      idempotency_key: key,
      request_fingerprint: fingerprint,
      status: "processing",
    })
    .select("id, request_fingerprint, order_id, status, response_status, response_body")
    .single();

  if (!error) return { kind: "reserved", record: data };
  if (!isUniqueViolation(error)) throw error;

  const existing = await fetchExistingRecord(admin, { userId, key });
  const classified = classifyExistingIdempotencyRecord(existing, fingerprint);
  if (classified.kind !== "retryable_failed") return classified;

  const { data: retried, error: retryError } = await admin
    .from("order_idempotency_keys")
    .update({
      request_fingerprint: fingerprint,
      order_id: null,
      response_status: null,
      response_body: null,
      status: "processing",
    })
    .eq("id", classified.record.id)
    .eq("status", "failed")
    .select("id, request_fingerprint, order_id, status, response_status, response_body")
    .single();

  if (retryError) throw retryError;
  return { kind: "reserved", record: retried };
};

export const completeOrderIdempotencyKey = async (admin, { recordId, orderId, responseStatus, responseBody }) => {
  if (!recordId) return;
  const { error } = await admin
    .from("order_idempotency_keys")
    .update({
      order_id: orderId,
      response_status: responseStatus,
      response_body: responseBody,
      status: "completed",
    })
    .eq("id", recordId);
  if (error) throw error;
};

export const releaseOrderIdempotencyKey = async (admin, { recordId }) => {
  if (!recordId) return;
  const { error } = await admin
    .from("order_idempotency_keys")
    .delete()
    .eq("id", recordId)
    .eq("status", "processing");
  if (error) throw error;
};
