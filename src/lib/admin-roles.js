const toBoolean = (value) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

const ROLE_ALIASES = new Map([
  ["customer", "customer"],
  ["rider", "rider"],
  ["driver", "rider"],
  ["dispatcher", "dispatcher"],
  ["staff", "dispatcher"],
  ["warehouse", "dispatcher"],
  ["admin", "admin"],
  ["super_admin", "super_admin"],
  ["superadmin", "super_admin"],
]);

export const ADMIN_PERMISSION_DEFINITIONS = [
  { value: "view_dispatch_workspace", label: "Dispatch Workspace" },
  { value: "manage_dispatch_routes", label: "Manage Dispatch Routes" },
  { value: "view_admin_workspace", label: "Admin Workspace" },
  { value: "view_staff_directory", label: "Staff Directory" },
  { value: "view_admin_logs", label: "Admin Logs" },
  { value: "manage_roles", label: "Assign Roles" },
  { value: "manage_staff", label: "Deactivate Users" },
];

export const ADMIN_ROLE_DEFINITIONS = [
  {
    value: "dispatcher",
    label: "Dispatcher",
    rank: 0.5,
    permissions: ["view_dispatch_workspace", "manage_dispatch_routes"],
  },
  {
    value: "admin",
    label: "Admin",
    rank: 1,
    permissions: ["view_dispatch_workspace", "manage_dispatch_routes", "view_admin_workspace", "view_staff_directory", "view_admin_logs"],
  },
  {
    value: "super_admin",
    label: "Super Admin",
    rank: 2,
    permissions: ["view_dispatch_workspace", "manage_dispatch_routes", "view_admin_workspace", "view_staff_directory", "view_admin_logs", "manage_roles", "manage_staff"],
  },
];

export const ADMIN_ROLE_OPTIONS = ADMIN_ROLE_DEFINITIONS.map((definition) => ({
  value: definition.value,
  label: definition.label,
}));

export const USER_ROLE_OPTIONS = [
  { value: "customer", label: "Customer" },
  { value: "rider", label: "Rider" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

export const ADMIN_STAFF_FILTER_OPTIONS = [
  { value: "all", label: "All Users" },
  { value: "workspace", label: "Workspace Access" },
  { value: "super_admin", label: "Super Admins" },
  { value: "admin", label: "Admins" },
  { value: "dispatcher", label: "Dispatchers" },
  { value: "inactive", label: "Inactive Users" },
];

const ROLE_DEFINITION_BY_VALUE = new Map(ADMIN_ROLE_DEFINITIONS.map((definition) => [definition.value, definition]));
const PERMISSION_DEFINITION_BY_VALUE = new Map(
  ADMIN_PERMISSION_DEFINITIONS.map((definition) => [definition.value, definition])
);

export const normalizeAdminRole = (value, isAdmin = false) => {
  const normalized = String(value || "").trim().toLowerCase();
  const role = ROLE_ALIASES.get(normalized);
  if (role && role !== "customer" && role !== "rider") return role;
  if (toBoolean(isAdmin)) return "admin";
  return null;
};

export const isAdminWorkspaceRole = (value, isAdmin = false) => ["admin", "super_admin"].includes(normalizeAdminRole(value, isAdmin));

export const isDispatchWorkspaceRole = (value, isAdmin = false) =>
  ["dispatcher", "admin", "super_admin"].includes(normalizeAdminRole(value, isAdmin));

export const getAdminRoleDefinition = (value, isAdmin = false) =>
  ROLE_DEFINITION_BY_VALUE.get(normalizeAdminRole(value, isAdmin) || "") || null;

export const getAdminRoleLabel = (value, isAdmin = false) => getAdminRoleDefinition(value, isAdmin)?.label || "No Access";

export const getAdminRoleRank = (value, isAdmin = false) => getAdminRoleDefinition(value, isAdmin)?.rank || 0;

export const hasAdminRolePermission = (roleValue, permission) => {
  const role = normalizeAdminRole(roleValue);
  if (!role) return false;
  const definition = ROLE_DEFINITION_BY_VALUE.get(role);
  return Array.isArray(definition?.permissions) && definition.permissions.includes(String(permission || "").trim());
};

export const getAdminPermissionLabel = (permission) =>
  PERMISSION_DEFINITION_BY_VALUE.get(String(permission || "").trim())?.label || "Permission";

export const normalizeAdminStaffFilter = (value) => {
  const normalized = String(value || "all").trim().toLowerCase();
  return ADMIN_STAFF_FILTER_OPTIONS.some((option) => option.value === normalized) ? normalized : "all";
};

export const matchesAdminStaffFilter = (record, filter = "all") => {
  const normalized = normalizeAdminStaffFilter(filter);
  if (normalized === "all") return true;
  if (normalized === "workspace") return Boolean(record?.hasWorkspaceAccess);
  if (normalized === "inactive") return record?.isActive === false;
  return normalizeAdminRole(record?.role) === normalized;
};

export const canAssignAdminRole = ({
  actorRole,
  actorUserId = "",
  targetRole,
  targetUserId = "",
  nextRole,
} = {}) => {
  const actor = normalizeAdminRole(actorRole);
  const target = normalizeAdminRole(targetRole);
  const nextRaw = ROLE_ALIASES.get(String(nextRole || "").trim().toLowerCase()) || null;
  const next = nextRaw === "customer" || nextRaw === "rider" ? nextRaw : normalizeAdminRole(nextRole);
  const actorId = String(actorUserId || "").trim();
  const targetId = String(targetUserId || "").trim();

  if (!hasAdminRolePermission(actor, "manage_roles")) return false;
  if (!next) return false;
  if (actorId && targetId && actorId === targetId) return false;

  if (actor === "super_admin") {
    if (target === "super_admin") return false;
    return ["customer", "rider", "dispatcher", "admin", "super_admin"].includes(next);
  }

  return false;
};

export const canDeactivateAdminUser = ({
  actorRole,
  actorUserId = "",
  targetRole,
  targetUserId = "",
  targetIsActive = true,
} = {}) => {
  const actor = normalizeAdminRole(actorRole);
  const target = normalizeAdminRole(targetRole);
  const actorId = String(actorUserId || "").trim();
  const targetId = String(targetUserId || "").trim();

  if (!hasAdminRolePermission(actor, "manage_staff")) return false;
  if (actorId && targetId && actorId === targetId) return false;
  if (targetIsActive === false) return false;

  if (actor === "super_admin") {
    return target == null || target === "admin";
  }

  return false;
};
