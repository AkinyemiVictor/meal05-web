export const SITE_NOTIFICATION_SEVERITIES = ["success", "warning", "error"];

const toText = (value, max = 500) => {
  const text = value == null ? "" : String(value).trim();
  return text ? text.slice(0, max) : "";
};

const toIsoOrNull = (value) => {
  const text = toText(value, 80);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const normalizeSiteNotificationSeverity = (value) => {
  const severity = toText(value, 24).toLowerCase();
  return SITE_NOTIFICATION_SEVERITIES.includes(severity) ? severity : "warning";
};

export const normalizeSiteNotificationRecord = (row) => {
  if (!row || typeof row !== "object") return null;
  const id = row.id == null ? "" : String(row.id);
  const title = toText(row.title, 140);
  const body = toText(row.body, 700);
  if (!id || !title || !body) return null;

  return {
    id,
    title,
    body,
    severity: normalizeSiteNotificationSeverity(row.severity),
    isActive: row.is_active !== false,
    startsAt: toIsoOrNull(row.starts_at),
    expiresAt: toIsoOrNull(row.expires_at),
    createdAt: toIsoOrNull(row.created_at),
    updatedAt: toIsoOrNull(row.updated_at),
  };
};

export const isSiteNotificationVisible = (notification, nowMs = Date.now()) => {
  if (!notification || notification.isActive === false) return false;
  const startsMs = notification.startsAt ? Date.parse(notification.startsAt) : Number.NaN;
  if (Number.isFinite(startsMs) && startsMs > nowMs) return false;
  const expiresMs = notification.expiresAt ? Date.parse(notification.expiresAt) : Number.NaN;
  if (Number.isFinite(expiresMs) && expiresMs <= nowMs) return false;
  return true;
};

export const getSiteNotificationStatus = (notification, nowMs = Date.now()) => {
  if (!notification) return { code: "unknown", label: "Unknown" };
  if (notification.isActive === false) return { code: "inactive", label: "Inactive" };
  const startsMs = notification.startsAt ? Date.parse(notification.startsAt) : Number.NaN;
  if (Number.isFinite(startsMs) && startsMs > nowMs) return { code: "scheduled", label: "Scheduled" };
  const expiresMs = notification.expiresAt ? Date.parse(notification.expiresAt) : Number.NaN;
  if (Number.isFinite(expiresMs) && expiresMs <= nowMs) return { code: "expired", label: "Expired" };
  return { code: "live", label: "Live" };
};
