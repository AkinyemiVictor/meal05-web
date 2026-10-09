const cleanPhone = (value) => String(value || "").replace(/[^0-9+]/g, "");

export const BUSINESS_WHATSAPP_NUMBER = cleanPhone(
  process.env.NEXT_PUBLIC_MEAL05_WHATSAPP_NUMBER || "2348118287047"
).replace(/^\+/, "");
export const BUSINESS_PHONE_NUMBER = cleanPhone(
  process.env.NEXT_PUBLIC_MEAL05_PHONE_NUMBER || BUSINESS_WHATSAPP_NUMBER
);

export const getBusinessWhatsAppHref = (message = "") =>
  `https://wa.me/${BUSINESS_WHATSAPP_NUMBER}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
export const getBusinessPhoneHref = () => `tel:${BUSINESS_PHONE_NUMBER}`;
