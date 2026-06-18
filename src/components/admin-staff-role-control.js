"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const normalizeRoleSelection = (currentRole, assignableRoles = []) => {
  if (!Array.isArray(assignableRoles) || !assignableRoles.length) return "";
  const current = String(currentRole || "").trim();
  if (assignableRoles.some((option) => option.value === current)) {
    return current;
  }
  return String(assignableRoles[0]?.value || "").trim();
};

export default function AdminStaffRoleControl({
  userId,
  name,
  currentRole = "",
  isActive = true,
  assignableRoles = [],
  canDeactivate = false,
}) {
  const router = useRouter();
  const [role, setRole] = useState(normalizeRoleSelection(currentRole, assignableRoles));
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isPending, startTransition] = useTransition();

  const disabled = isPending || isSavingRole || isDeactivating;
  useEffect(() => {
    setRole(normalizeRoleSelection(currentRole, assignableRoles));
    setError("");
    setOk("");
  }, [assignableRoles, currentRole, userId]);

  const saveRole = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    if (!userId) {
      setError("Missing user id.");
      return;
    }
    if (!assignableRoles.length || !role) {
      setError("Role changes are locked for this user.");
      return;
    }
    if (role === currentRole) {
      setError("No role change selected.");
      return;
    }

    setIsSavingRole(true);
    try {
      const response = await fetch("/api/admin/assign-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }

      setOk("Role updated.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error. Try again.");
    } finally {
      setIsSavingRole(false);
    }
  };

  const deactivateUser = async () => {
    setError("");
    setOk("");

    if (!userId) {
      setError("Missing user id.");
      return;
    }
    if (!canDeactivate || isActive === false) {
      setError("Deactivation is locked for this user.");
      return;
    }
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Deactivate ${name || "this user"}?`);
      if (!confirmed) return;
    }

    setIsDeactivating(true);
    try {
      const response = await fetch("/api/admin/deactivate-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }

      setOk("User deactivated.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error. Try again.");
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8, minWidth: 240 }}>
      <form onSubmit={saveRole} style={{ display: "grid", gap: 6 }}>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value)}
          disabled={disabled || !assignableRoles.length}
          aria-label={`Role for ${name}`}
          style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
        >
          {!assignableRoles.length ? <option value="">Role locked</option> : null}
          {assignableRoles.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={disabled || !assignableRoles.length}
          style={{
            justifySelf: "start",
            border: "1px solid #0f172a",
            borderRadius: 6,
            background: "#0f172a",
            color: "#ffffff",
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            cursor: disabled || !assignableRoles.length ? "not-allowed" : "pointer",
            opacity: disabled || !assignableRoles.length ? 0.7 : 1,
          }}
        >
          {isSavingRole ? "Saving..." : "Save Role"}
        </button>
      </form>

      <button
        type="button"
        onClick={deactivateUser}
        disabled={disabled || !canDeactivate || isActive === false}
        style={{
          justifySelf: "start",
          border: "1px solid #b91c1c",
          borderRadius: 6,
          background: "#ffffff",
          color: "#b91c1c",
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: disabled || !canDeactivate || isActive === false ? "not-allowed" : "pointer",
          opacity: disabled || !canDeactivate || isActive === false ? 0.7 : 1,
        }}
      >
        {isDeactivating ? "Deactivating..." : isActive === false ? "Inactive" : "Deactivate User"}
      </button>

      {!assignableRoles.length && !canDeactivate ? (
        <span style={{ color: "#64748b", fontSize: 12 }}>View only for this user.</span>
      ) : null}
      {error ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
      {!error && ok ? <span style={{ color: "#166534", fontSize: 12 }}>{ok}</span> : null}
    </div>
  );
}
