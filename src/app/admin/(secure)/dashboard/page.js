import Link from "next/link";
import { adminFormatters, loadOrdersMetrics, loadOverviewMetrics } from "@/lib/admin-dashboard-data";

export const dynamic = "force-dynamic";

const textStatus = (value) => {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const issueAgeTone = (issueAgeHours) => {
  if (Number.isFinite(issueAgeHours) && issueAgeHours >= 48) return { bg: "#fee2e2", fg: "#991b1b", label: "Critical" };
  if (Number.isFinite(issueAgeHours) && issueAgeHours >= 24) return { bg: "#ffedd5", fg: "#9a3412", label: "Overdue" };
  if (Number.isFinite(issueAgeHours) && issueAgeHours >= 6) return { bg: "#fef3c7", fg: "#854d0e", label: "At Risk" };
  return { bg: "#e5e7eb", fg: "#475569", label: "Monitor" };
};

export default async function AdminDashboardPage() {
  const overview = await loadOverviewMetrics();
  const recentOrders = await loadOrdersMetrics({ status: "all", paymentStatus: "all", page: 1, pageSize: 12 });

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Executive Overview</h1>
        <p style={{ margin: "0 0 6px", color: "#64748b" }}>
          Revenue, order health, and operational alerts in one view.
        </p>
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>
          Updated: {adminFormatters.dateTime(overview.generatedAt)}
        </p>
      </header>

      {overview.warnings.length ? (
        <section style={{ marginBottom: 12, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", borderRadius: 8, padding: "10px 12px" }}>
          <strong>Some overview metrics are partial.</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {overview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
        {overview.cards.map((card) => (
          <article key={card.label} style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
            <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>{card.label}</p>
            <p style={{ margin: "5px 0 0", fontWeight: 700, fontSize: 20, color: "#0f172a" }}>{card.value}</p>
          </article>
        ))}
      </section>

      <section style={{ border: "1px solid #fecaca", borderRadius: 12, background: "#ffffff" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #fee2e2", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <strong>Recent Orders</strong>
          <Link href="/admin/orders" style={{ color: "#1d4ed8", textDecoration: "none", fontWeight: 600, fontSize: 13 }}>
            View all orders
          </Link>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "#fef2f2" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #fee2e2" }}>Order</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #fee2e2" }}>Customer</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #fee2e2" }}>State</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #fee2e2" }}>Status</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #fee2e2" }}>Age</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.records.map((row) => {
                const issueAgeHours = row.issueAgeHours;
                const issueTone = issueAgeTone(issueAgeHours);
                const issueAgeLabel = row.issueAgeLabel || "-";
                return (
                  <tr key={String(row.id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 10 }}>
                      <strong>#{row.id}</strong>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>{adminFormatters.currency(row.total)}</p>
                    </td>
                    <td style={{ padding: 10 }}>{row.customer}</td>
                    <td style={{ padding: 10 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ background: issueTone.bg, color: issueTone.fg, borderRadius: 999, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>
                          {issueTone.label}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 10 }}>
                      <p style={{ margin: 0, fontSize: 12 }}>Order: <strong>{textStatus(row.status)}</strong></p>
                      <p style={{ margin: "4px 0 0", fontSize: 12 }}>Payment: <strong>{textStatus(row.paymentStatus)}</strong></p>
                      <p style={{ margin: "4px 0 0", fontSize: 12 }}>Delivery: <strong>{row.deliveryStatus ? textStatus(row.deliveryStatus) : "-"}</strong></p>
                    </td>
                    <td style={{ padding: 10 }}>
                      <p style={{ margin: 0, fontSize: 12 }}>{issueAgeLabel} old</p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>{adminFormatters.dateTime(row.updatedAt || row.createdAt)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!recentOrders.records.length ? <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No recent orders yet.</p> : null}
      </section>
    </main>
  );
}
