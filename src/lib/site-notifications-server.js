import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import {
  getSiteNotificationStatus,
  isSiteNotificationVisible,
  normalizeSiteNotificationRecord,
} from "@/lib/site-notifications";

const UNKNOWN_TABLE_CODES = new Set(["42P01", "PGRST116", "PGRST200", "PGRST205"]);

const isUnknownSiteNotificationTable = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return UNKNOWN_TABLE_CODES.has(error?.code) || message.includes("site_notifications") || message.includes("could not find the table");
};

export async function loadActiveSiteNotification(adminClient = getSupabaseAdminClient()) {
  const result = await adminClient
    .from("site_notifications")
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (result.error) {
    if (isUnknownSiteNotificationTable(result.error)) return { notification: null, warnings: [] };
    throw result.error;
  }

  const nowMs = Date.now();
  const notification = (Array.isArray(result.data) ? result.data : [])
    .map(normalizeSiteNotificationRecord)
    .filter(Boolean)
    .find((record) => isSiteNotificationVisible(record, nowMs));

  return { notification: notification || null, warnings: [] };
}

export async function loadSiteNotificationsAdminData({ limit = 25 } = {}) {
  const warnings = [];
  const result = await getSupabaseAdminClient()
    .from("site_notifications")
    .select("*")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, Number(limit || 25))));

  if (result.error) {
    if (isUnknownSiteNotificationTable(result.error)) {
      warnings.push("Site notifications are unavailable until the site notification migration is applied.");
    } else {
      warnings.push(`Site notification query failed: ${result.error.message}`);
    }
    return { records: [], liveCount: 0, warnings, schemaAvailable: false };
  }

  const records = (Array.isArray(result.data) ? result.data : [])
    .map(normalizeSiteNotificationRecord)
    .filter(Boolean)
    .map((notification) => {
      const status = getSiteNotificationStatus(notification);
      return { ...notification, status: status.code, statusLabel: status.label };
    });

  return {
    records,
    liveCount: records.filter((notification) => notification.status === "live").length,
    warnings,
    schemaAvailable: true,
  };
}
