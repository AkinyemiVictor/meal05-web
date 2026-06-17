export const normalizePromoText = (value) => {
  const text = String(value || "").trim();
  return text ? text.slice(0, 80) : null;
};

export const normalizePromoEnabled = (value) => {
  if (value === true || value === false) return value;
  if (value == null || value === "") return false;
  if (typeof value === "number") return value !== 0;

  const text = String(value).trim().toLowerCase();
  if (!text) return false;
  if (["true", "1", "yes", "on", "enabled", "active"].includes(text)) return true;
  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) return false;
  return Boolean(value);
};

export const parsePromoExpiry = (value) => {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const getProductPromoState = (product, nowMs = Date.now()) => {
  const isEnabled = normalizePromoEnabled(
    product?.promoTagEnabled ?? product?.promo_tag_enabled ?? product?.promoEnabled
  );
  const text = normalizePromoText(product?.promoTagText ?? product?.promo_tag_text ?? product?.promoText);
  if (!text) {
    return {
      isActive: false,
      isExpired: false,
      isEnabled,
      text: null,
      expiresAt: null,
      expiresMs: null,
    };
  }

  const expiresAt = parsePromoExpiry(
    product?.promoTagExpiresAt ?? product?.promo_tag_expires_at ?? product?.promoExpiresAt
  );
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const hasExpiry = Number.isFinite(expiresMs);
  const isExpired = hasExpiry && expiresMs <= nowMs;

  return {
    isActive: isEnabled && !isExpired,
    isExpired,
    isEnabled,
    text,
    expiresAt,
    expiresMs: hasExpiry ? expiresMs : null,
  };
};

export const formatPromoCountdown = (expiresMs, nowMs = Date.now()) => {
  if (!Number.isFinite(expiresMs)) return "";

  const remainingMs = Math.max(0, expiresMs - nowMs);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  if (totalSeconds <= 0) return "Ended";

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s left`;
};
