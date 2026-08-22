export const validateAvailabilityPaymentWindow = async (admin, order) => {
  if (!order?.availability_request_id) return { ok: true };
  const { data, error } = await admin.from("availability_requests")
    .select("id,status,payment_expires_at,converted_order_id")
    .eq("id", order.availability_request_id).maybeSingle();
  if (error) return { ok: false, status: 503, error: "Unable to validate the availability confirmation" };
  if (!data || data.status !== "converted" || String(data.converted_order_id) !== String(order.id)) {
    return { ok: false, status: 409, error: "Availability confirmation is required before payment" };
  }
  if (!data.payment_expires_at || new Date(data.payment_expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 409, error: "The confirmed availability payment window has expired" };
  }
  return { ok: true };
};

