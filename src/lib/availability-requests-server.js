import { normalizeSelectionMode, normalizeSizePreference, SELECTION_MODE_FLEXIBLE } from "@/lib/commerce-options";
import { attachAvailabilityRequestLifecycle, deriveAvailabilityRequestLifecycle } from "@/lib/availability-request-state";

export const AVAILABILITY_REQUEST_SELECT = `
  id, request_number, user_id, market_id, status, delivery_address,
  customer_name, customer_phone, customer_note, submitted_total, final_total,
  currency_code, confirmation_deadline_at, confirmed_at, payment_expires_at,
  converted_order_id, created_at, updated_at,
  items:availability_request_items(
    id, product_id, variant_id, product_name, variant_name, unit, quantity,
    submitted_unit_price, confirmed_unit_price, requires_confirmation,
    resolution_status, size_preference, admin_note, customer_removed_at
  )`;

export const expireAvailabilityRequest = async (admin, request, now = new Date()) => {
  if (!request) return request;
  const lifecycle = deriveAvailabilityRequestLifecycle(request, now);

  // Missing or exceeded confirmation SLAs do not cancel a customer's request.
  // Only a confirmed basket whose payment window has actually elapsed is expired.
  if (!lifecycle.paymentWindowExpired) {
    return attachAvailabilityRequestLifecycle(request, now);
  }

  const nowIso = new Date(now).toISOString();
  const { data, error } = await admin
    .from("availability_requests")
    .update({ status: "expired", updated_at: nowIso })
    .eq("id", request.id)
    .eq("status", "confirmed")
    .lte("payment_expires_at", nowIso)
    .select(AVAILABILITY_REQUEST_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (data) return attachAvailabilityRequestLifecycle(data, now);

  // Another request may have changed the record between our read and update.
  // Re-read it instead of returning a stale lifecycle state.
  const { data: current, error: refreshError } = await admin
    .from("availability_requests")
    .select(AVAILABILITY_REQUEST_SELECT)
    .eq("id", request.id)
    .maybeSingle();
  if (refreshError) throw refreshError;
  return attachAvailabilityRequestLifecycle(current || request, now);
};

export const resolveRequestState = (items = []) => {
  const active = items.filter((item) => !item.customer_removed_at);
  if (active.some((item) => item.resolution_status === "unavailable")) return "action_required";
  if (active.some((item) => item.resolution_status === "pending")) return "checking";
  return active.length ? "confirmed" : "cancelled";
};

export const calculateRequestTotal = (items = []) =>
  Math.round(items.filter((item) => !item.customer_removed_at).reduce((sum, item) => {
    const price = Number(item.confirmed_unit_price ?? item.submitted_unit_price ?? 0);
    return sum + price * Number(item.quantity || 0);
  }, 0) * 100) / 100;

export const validatePreferenceForProduct = (preference, product) => {
  const model = normalizeSelectionMode(product?.selection_model);
  if (model !== SELECTION_MODE_FLEXIBLE) return preference == null ? null : undefined;
  return normalizeSizePreference(preference, model) || "best_available";
};

export { attachAvailabilityRequestLifecycle } from "@/lib/availability-request-state";
