import { normalizeSelectionMode, normalizeSizePreference, SELECTION_MODE_FLEXIBLE } from "@/lib/commerce-options";

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

export const expireAvailabilityRequest = async (admin, request) => {
  if (!request || !["confirmed", "action_required"].includes(request.status)) return request;
  if (!request.payment_expires_at || new Date(request.payment_expires_at).getTime() > Date.now()) return request;
  const { data } = await admin
    .from("availability_requests")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("id", request.id)
    .in("status", ["confirmed", "action_required"])
    .select(AVAILABILITY_REQUEST_SELECT)
    .maybeSingle();
  return data || { ...request, status: "expired" };
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

