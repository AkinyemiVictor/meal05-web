import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

const toNumberOrNull = (value) => {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
};

const pickEntityType = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const direct =
    entry.entity_type ||
    entry.entityType ||
    entry.route ||
    entry.stage ||
    entry.provider ||
    null;
  const text = String(direct || "").trim();
  return text || null;
};

const pickEntityId = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const candidates = [
    entry.entity_id,
    entry.entityId,
    entry.order_id,
    entry.orderId,
    entry.product_id,
    entry.productId,
    entry.variant_id,
    entry.variantId,
  ];
  for (const candidate of candidates) {
    const parsed = toNumberOrNull(candidate);
    if (parsed != null) return parsed;
  }
  return null;
};

const writeLog = async ({ type, entry }) => {
  const admin = getSupabaseAdminClient();
  const payload = {
    type,
    action: entry?.action || entry?.route || entry?.stage || type,
    route: pickEntityType(entry),
    actor: entry?.actor || entry?.email || null,
    message: entry?.message || entry?.error || entry?.stage || entry?.route || type,
    metadata: {
      ts: Date.now(),
      entity_id: pickEntityId(entry),
      ...entry,
    },
  };

  const { error } = await admin.from("admin_logs").insert(payload);
  if (error) {
    throw error;
  }
};

export async function logAdminEvent(event) {
  const entry = {
    type: "admin:event",
    ...(event || {}),
  };
  try {
    await writeLog({ type: "event", entry });
  } catch (error) {
    console.warn("Unable to persist admin event log", error);
    console.info("[admin:event]", entry);
  }
}

export async function logAdminError(error, context = {}) {
  const entry = {
    type: "admin:error",
    error: typeof error === "string" ? error : (error?.message || String(error)),
    stack: error?.stack || undefined,
    ...(context || {}),
  };
  try {
    await writeLog({ type: "error", entry });
  } catch (persistError) {
    console.error("Unable to persist admin error log", persistError);
    console.error("[admin:error]", entry);
  }
}

const apiLog = { logAdminEvent, logAdminError };

export default apiLog;
