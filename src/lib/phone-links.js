const INVALID_PHONE_VALUES = new Set([
  "",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "not available",
  "not provided",
  "not set",
  "no phone",
  "phone",
  "0000000000",
  "00000000000",
]);

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

const formatNigerianPhone = (digits) => {
  const local = digits.startsWith("234") ? `0${digits.slice(3)}` : digits;
  if (local.length !== 11) return `+${digits}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
};

const formatInternationalPhone = (digits) => {
  if (digits.startsWith("234") && digits.length === 13) return formatNigerianPhone(digits);
  return `+${digits}`;
};

export function normalizePhoneContact(value) {
  const raw = String(value ?? "").trim();
  const lowered = raw.toLowerCase().replace(/\s+/g, " ");
  if (INVALID_PHONE_VALUES.has(lowered)) return null;

  let normalized = raw.replace(/[^\d+]/g, "");
  if (!normalized || normalized.includes("+", 1)) return null;
  if (normalized.startsWith("+")) {
    normalized = `+${onlyDigits(normalized)}`;
  } else {
    normalized = onlyDigits(normalized);
  }

  let digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  if (digits.startsWith("0") && digits.length === 11) {
    digits = `234${digits.slice(1)}`;
  } else if (digits.startsWith("2340") && digits.length === 14) {
    digits = `234${digits.slice(4)}`;
  }

  if (!/^\d{10,15}$/.test(digits)) return null;
  if (digits.startsWith("234") && digits.length !== 13) return null;

  return {
    displayPhone: formatInternationalPhone(digits),
    callUrl: `tel:+${digits}`,
    whatsappNumber: digits,
  };
}

export function buildWhatsappUrl(whatsappNumber, message) {
  const digits = onlyDigits(whatsappNumber);
  if (!/^\d{10,15}$/.test(digits)) return "";
  const text = encodeURIComponent(String(message || "").trim());
  return `https://wa.me/${digits}${text ? `?text=${text}` : ""}`;
}
