import "server-only";

import { isAdminEmail } from "@/lib/admin";
import { hasAdminRolePermission, isAdminWorkspaceRole, normalizeAdminRole } from "@/lib/admin-roles";
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

const toBoolean = (value) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  const lowered = String(value).trim().toLowerCase();
  return lowered === "true" || lowered === "yes" || lowered === "1";
};

const LOOKUPS = [
  { table: "users", select: "id, is_admin, role", filter: "id" },
  { table: "users", select: "auth_id, is_admin, role", filter: "auth_id" },
  { table: "users", select: "id, is_admin", filter: "id" },
  { table: "users", select: "auth_id, is_admin", filter: "auth_id" },
  { table: "users", select: "id, role", filter: "id" },
  { table: "users", select: "auth_id, role", filter: "auth_id" },
  { table: "users", select: "user_id, is_admin, role", filter: "user_id" },
  { table: "users", select: "user_id, is_admin", filter: "user_id" },
  { table: "users", select: "user_id, role", filter: "user_id" },
  { table: "profiles", select: "id, is_admin, role", filter: "id" },
  { table: "profiles", select: "auth_id, is_admin, role", filter: "auth_id" },
  { table: "profiles", select: "id, is_admin", filter: "id" },
  { table: "profiles", select: "auth_id, is_admin", filter: "auth_id" },
  { table: "profiles", select: "id, role", filter: "id" },
  { table: "profiles", select: "auth_id, role", filter: "auth_id" },
  { table: "profiles", select: "user_id, is_admin, role", filter: "user_id" },
  { table: "profiles", select: "user_id, is_admin", filter: "user_id" },
  { table: "profiles", select: "user_id, role", filter: "user_id" },
];

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
      const role = normalizeAdminRole(result.data?.role, result.data?.is_admin);
      if (isAdminWorkspaceRole(role)) {
        return {
          allowed: true,
          role,
          source: `${candidate.table}.${candidate.filter}`,
          explicitRole: true,
          isAdmin: toBoolean(result.data?.is_admin),
          userId: id,
          email: normalizedEmail,
        };
      }
      continue;
    }

    if (isUnknownColumnError(result.error?.message)) {
      continue;
    }
  }

  // Compatibility fallback for environments not yet migrated to role/is_admin columns.
  if (!schemaMatchAttempted && isAdminEmail(normalizedEmail)) {
    return {
      allowed: true,
      role: "owner",
      source: "email_fallback",
      explicitRole: false,
      isAdmin: true,
      userId: id,
      email: normalizedEmail,
    };
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
