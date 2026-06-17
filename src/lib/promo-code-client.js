export async function requestPromoCodeValidation({
  code,
  subtotal,
  itemsCount,
  deliveryFee,
  signal,
} = {}) {
  const response = await fetch("/api/promo-codes/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      subtotal,
      items_count: itemsCount,
      delivery_fee: deliveryFee,
    }),
    signal,
  });

  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

const promoCodeClient = { requestPromoCodeValidation };

export default promoCodeClient;
