import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ADMIN_STAFF_FILTER_OPTIONS,
  USER_ROLE_OPTIONS,
  canAssignAdminRole,
  canDeactivateAdminUser,
  getAdminRoleLabel,
  normalizeAdminStaffFilter,
} from "@/lib/admin-roles";
import { getAdminAccessProfile } from "@/lib/admin-access";
import { loadAdminStaffControlData } from "@/lib/admin-dashboard-data";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import AdminStaffRoleControl from "@/components/admin-staff-role-control";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/staff";

const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
};

const buildPageHref = (params, updates = {}) => {
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (key in updates) return;
    if (value == null || value === "") return;
    query.set(key, String(value));
  });

  Object.entries(updates).forEach(([key, value]) => {
    if (value == null || value === "") return;
    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `${PAGE_PATH}?${queryString}` : PAGE_PATH;
};

function PreservedParams({ params, exclude = [] }) {
  return Object.entries(params || {}).map(([key, value]) => {
    if (exclude.includes(key)) return null;
    if (value == null || value === "") return null;
    return <input key={key} type="hidden" name={key} value={String(value)} />;
  });
}

function Pager({ params, page, totalPages }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Link
        href={buildPageHref(params, { page: Math.max(1, page - 1) })}
        style={{
          pointerEvents: page <= 1 ? "none" : "auto",
          opacity: page <= 1 ? 0.5 : 1,
          textDecoration: "none",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          padding: "6px 10px",
          color: "#0f172a",
          background: "#ffffff",
        }}
      >
        Previous
      </Link>
      <Link
        href={buildPageHref(params, { page: Math.min(totalPages, page + 1) })}
        style={{
          pointerEvents: page >= totalPages ? "none" : "auto",
          opacity: page >= totalPages ? 0.5 : 1,
          textDecoration: "none",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          padding: "6px 10px",
          color: "#0f172a",
          background: "#ffffff",
        }}
      >
        Next
      </Link>
    </div>
  );
}

export default async function AdminStaffPage({ searchParams }) {
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) redirect("/admin/login");

  const actorProfile = await getAdminAccessProfile({ userId: user.id, email: user.email });
  if (!actorProfile.allowed) redirect("/admin/login?forbidden=1");

  const params = (await searchParams) || {};
  const query = String(params?.q || "").trim();
  const filter = normalizeAdminStaffFilter(params?.filter);
  const pageSize = Math.max(10, Math.min(100, toPositiveInt(params?.pageSize, 20)));
  const page = toPositiveInt(params?.page, 1);

  const data = await loadAdminStaffControlData({ page, pageSize, query, filter });
  const warnings = Array.from(new Set(data.warnings || []));
  const recordStart = data.totalCount ? (data.page - 1) * data.pageSize + 1 : 0;
  const recordEnd = Math.min(data.totalCount, data.page * data.pageSize);

  return (
    <main style={{ maxWidth: 1240, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Staff Roles & Access</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Manage Meal05 account roles, dispatch access, rider access, deactivate compromised accounts, and watch recent admin activity.
        </p>
        <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>
          Your role: <strong>{getAdminRoleLabel(actorProfile.role)}</strong>
        </p>
      </header>

      <section
        style={{
          marginBottom: 12,
          background: "#fff7ed",
          border: "1px solid #fed7aa",
          color: "#9a3412",
          borderRadius: 8,
          padding: "10px 12px",
        }}
      >
          <strong>Role safety.</strong> Workspace access now follows the Supabase users.role rule. Active Super Admins can grant Customer, Rider, Dispatcher, Admin, or Super Admin roles.
      </section>

      {warnings.length ? (
        <section
          style={{
            marginBottom: 12,
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            color: "#9f1239",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <strong>Some staff data is partial.</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Workspace Access</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{data.workspaceAccessCount} / {data.totalUsers}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#0f172a", fontSize: 12 }}>Super Admins</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{data.superAdminCount}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#0f172a", fontSize: 12 }}>Admins</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{data.adminCount}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#b91c1c", fontSize: 12 }}>Inactive</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#b91c1c" }}>{data.inactiveCount}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#1d4ed8", fontSize: 12 }}>Recent Actors</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#1d4ed8" }}>{data.recentActorCount}</p>
        </article>
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Staff Directory</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>Adjust roles and deactivate compromised accounts.</p>
        </div>

        <form
          method="GET"
          style={{ padding: 12, borderBottom: "1px solid #e2e8f0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        >
          <PreservedParams params={params} exclude={["page", "pageSize", "q", "filter"]} />
          <input type="hidden" name="page" value="1" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search name or email"
            style={{ minWidth: 220, flex: "1 1 280px", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          />
          <select name="filter" defaultValue={filter} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            {ADMIN_STAFF_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select name="pageSize" defaultValue={String(pageSize)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            <option value="20">20 rows</option>
            <option value="40">40 rows</option>
            <option value="80">80 rows</option>
            <option value="100">100 rows</option>
          </select>
          <button
            type="submit"
            style={{ border: "1px solid #0f172a", borderRadius: 8, background: "#0f172a", color: "#ffffff", padding: "8px 12px", fontSize: 14, fontWeight: 600 }}
          >
            Filter
          </button>
        </form>

        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>
          Showing {data.totalCount ? `${recordStart}-${recordEnd}` : "0"} of {data.totalCount} staff records.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>User</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Access</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Recent Activity</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((row) => {
                const assignableRoles = USER_ROLE_OPTIONS.filter((option) =>
                  canAssignAdminRole({
                    actorRole: actorProfile.role,
                    actorUserId: user.id,
                    targetRole: row.role,
                    targetUserId: row.actionUserId,
                    nextRole: option.value,
                  })
                );
                const canDeactivate = canDeactivateAdminUser({
                  actorRole: actorProfile.role,
                  actorUserId: user.id,
                  targetRole: row.role,
                  targetUserId: row.actionUserId,
                  targetIsActive: row.isActive,
                });
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{row.displayName}</p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>{row.email || "No email"}</p>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        <span
                          style={{
                            background: "#dbeafe",
                            color: "#1d4ed8",
                            borderRadius: 999,
                            padding: "2px 8px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {row.roleLabel}
                        </span>
                        {!row.hasWorkspaceAccess ? (
                          <span
                            style={{
                              background: "#e5e7eb",
                              color: "#374151",
                              borderRadius: 999,
                              padding: "2px 8px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            No Access
                          </span>
                        ) : null}
                        {row.isActive === false ? (
                          <span
                            style={{
                              background: "#fee2e2",
                              color: "#991b1b",
                              borderRadius: 999,
                              padding: "2px 8px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            Inactive
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top", fontSize: 13 }}>
                      <p style={{ margin: 0 }}>Sources: {(row.sources || []).join(", ") || "Unknown"}</p>
                      <p style={{ margin: "4px 0 0" }}>Created: {row.createdAt || "Unknown"}</p>
                      <p style={{ margin: "4px 0 0" }}>Updated: {row.updatedAt || "Unknown"}</p>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top", fontSize: 13 }}>
                      <p style={{ margin: 0 }}>Events: {row.recentAdminActivityCount}</p>
                      <p style={{ margin: "4px 0 0" }}>Last: {row.lastAdminActivityAt || "No activity"}</p>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <AdminStaffRoleControl
                        userId={row.actionUserId || row.id}
                        name={row.displayName}
                        currentRole={row.role}
                        isActive={row.isActive}
                        assignableRoles={assignableRoles}
                        canDeactivate={canDeactivate}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!data.records.length ? (
          <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No staff match the current filters.</p>
        ) : null}

        <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "#64748b", fontSize: 13 }}>Page {data.page} of {data.totalPages}</span>
          <Pager params={params} page={data.page} totalPages={data.totalPages} />
        </div>
      </section>
    </main>
  );
}
