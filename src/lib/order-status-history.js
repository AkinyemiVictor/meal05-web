import "server-only";

const toOrderId = (value) => {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
};

export const buildOrderStatusHistoryPayload = ({ orderId, fromStatus, toStatus, changedBy, note } = {}) => {
  const safeOrderId = toOrderId(orderId);
  const nextStatus = String(toStatus || "").trim().toLowerCase();
  if (!safeOrderId || !nextStatus) return null;

  return {
    order_id: safeOrderId,
    from_status: fromStatus ? String(fromStatus).trim().toLowerCase() : null,
    to_status: nextStatus,
    changed_by: changedBy || null,
    note: note ? String(note).trim() : null,
  };
};

export const insertOrderStatusHistory = async (admin, payload) => {
  const row = buildOrderStatusHistoryPayload(payload);
  if (!row || !admin) return { skipped: true };
  return admin.from("order_status_history").insert(row);
};
