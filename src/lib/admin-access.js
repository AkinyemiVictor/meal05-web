import "server-only";

import { hasAdminRolePermission, isAdminWorkspaceRole, isDispatchWorkspaceRole, normalizeAdminRole } from "@/lib/admin-roles";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

const isUnknownColumnError = (message) => {
  const text = String(message || "");
  return (
    /schema cache/i.test(text) ||
    /column .* does not exist/i.test(text) ||
    /could not find the .* column/i.test(text) ||
    /relation .* does not exist/i.test(text)
  );
};

const LOOKUPS = [
  { table: "users", select: "id, auth_id, email, role, is_active", filter: "id" },
  { table: "users", select: "id, auth_id, email, role, is_active", filter: "auth_id" },
];

const isActiveUser = (value) => value === true;
const isCanonicalAdminRole = (role) => role === "admin" || role === "super_admin";

export async function getAdminAccessProfile({ userId, email, adminClient } = {}) {
  const id = String(userId || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!id && !normalizedEmail) {
    return {
      allowed: false,
      role: null,
      source: null,
      explicitRole: false,
      userId: "",
      email: "",
    };
  }

  const admin = adminClient || getSupabaseAdminClient();
  let schemaMatchAttempted = false;

  for (const candidate of LOOKUPS) {
    if (!id) break;
    let result;
    try {
      result = await admin
        .from(candidate.table)
        .select(candidate.select)
        .eq(candidate.filter, id)
        .maybeSingle();
    } catch {
      continue;
    }

    if (!result?.error) {
      schemaMatchAttempted = true;
      const role = normalizeAdminRole(result.data?.role);
      if (isAdminWorkspaceRole(role) && isCanonicalAdminRole(role) && isActiveUser(result.data?.is_active)) {
        return {
          allowed: true,
          role,
          source: `${candidate.table}.${candidate.filter}`,
          explicitRole: true,
          isAdmin: true,
          isActive: true,
          userId: String(result.data?.id || id),
          email: String(result.data?.email || normalizedEmail).trim().toLowerCase(),
        };
      }
      if (role && isActiveUser(result.data?.is_active)) {
        return {
          allowed: false,
          role,
          source: `${candidate.table}.${candidate.filter}`,
          explicitRole: true,
          isAdmin: false,
          isActive: true,
          userId: String(result.data?.id || id),
          email: String(result.data?.email || normalizedEmail).trim().toLowerCase(),
        };
      }
      continue;
    }

    if (isUnknownColumnError(result.error?.message)) {
      continue;
    }
  }

  return {
    allowed: false,
    role: null,
    source: schemaMatchAttempted ? "db" : null,
    explicitRole: schemaMatchAttempted,
    isAdmin: false,
    userId: id,
    email: normalizedEmail,
  };
}

export async function hasAdminAccess(subject = {}) {
  const profile = await getAdminAccessProfile(subject);
  return profile.allowed;
}

export async function hasAdminPermission(subject = {}, permission) {
  const profile = await getAdminAccessProfile(subject);
  if (!profile.allowed) return false;
  return hasAdminRolePermission(profile.role, permission);
}

export async function hasDispatchAccess(subject = {}) {
  const profile = await getAdminAccessProfile(subject);
  return Boolean(profile.isActive && isDispatchWorkspaceRole(profile.role));
}

export async function hasDispatchPermission(subject = {}, permission = "manage_dispatch_routes") {
  const profile = await getAdminAccessProfile(subject);
  if (!profile.isActive || !isDispatchWorkspaceRole(profile.role)) return false;
  return hasAdminRolePermission(profile.role, permission);
}
