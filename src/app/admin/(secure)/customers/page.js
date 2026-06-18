import { adminFormatters, loadCustomerMetrics } from "@/lib/admin-dashboard-data";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({ searchParams }) {
  const params = (await searchParams) || {};
  const days = Math.max(7, Math.min(90, Number(params?.days || 7)));
  const data = await loadCustomerMetrics({ days });

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Customer Analytics</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          User growth and repeat purchase behavior.
        </p>
      </header>

      {data.warnings.length ? (
        <section style={{ marginBottom: 12, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", borderRadius: 8, padding: "10px 12px" }}>
          <strong>Some customer metrics are partial.</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginBottom: 14 }}>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Total Users</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.totalUsers)}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>New Users ({days}d)</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.newUsers)}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Buyers (90d)</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.buyers90d)}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Repeat Customers</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.repeatCustomers)}</p>
        </article>
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Top Spending Customers</strong>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Customer</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Orders</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Total Spend</th>
              </tr>
            </thead>
            <tbody>
              {data.rankedCustomers.map((row) => (
                <tr key={row.userId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 10 }}>{row.label}</td>
                  <td style={{ padding: 10 }}>{adminFormatters.number(row.orders)}</td>
                  <td style={{ padding: 10 }}>{adminFormatters.currency(row.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.rankedCustomers.length ? <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No paid customer activity yet.</p> : null}
      </section>
    </main>
  );
}
