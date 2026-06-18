import { adminFormatters, loadAnalyticsMetrics } from "@/lib/admin-dashboard-data";

export const dynamic = "force-dynamic";

const titleCase = (value) => {
  const text = String(value || "unknown");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export default async function AdminAnalyticsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const days = Math.max(7, Math.min(90, Number(params?.days || 30)));
  const data = await loadAnalyticsMetrics({ days });
  const peak = data.hourly.slice().sort((a, b) => b.orders - a.orders)[0] || { hour: 0, orders: 0 };

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Analytics</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Payment, cart, ratings, and order pattern analytics for the last {days} days.
        </p>
      </header>

      {data.warnings.length ? (
        <section style={{ marginBottom: 12, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", borderRadius: 8, padding: "10px 12px" }}>
          <strong>Some analytics are partial.</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginBottom: 14 }}>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Active Carts</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.activeCartUsers)}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Stale Cart Rows (24h+)</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.staleCarts)}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Average Rating</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{data.averageRating.toFixed(2)} / 5</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Peak Hour</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{String(peak.hour).padStart(2, "0")}:00 ({adminFormatters.number(peak.orders)} orders)</p>
        </article>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
            <strong>Payment Method Split</strong>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {data.paymentMethods.map((row) => (
              <li key={row.method} style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>{titleCase(row.method)}</p>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
                  {adminFormatters.number(row.count)} orders • {adminFormatters.currency(row.revenue)}
                </p>
              </li>
            ))}
            {!data.paymentMethods.length ? <li style={{ padding: "10px 12px", color: "#64748b" }}>No payment method data yet.</li> : null}
          </ul>
        </article>

        <article style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
            <strong>Order Status Mix</strong>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {data.statusCounts.map((row) => (
              <li key={row.status} style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ fontWeight: 600 }}>{titleCase(row.status)}</span>
                <span style={{ color: "#64748b", marginLeft: 8 }}>{adminFormatters.number(row.count)}</span>
              </li>
            ))}
            {!data.statusCounts.length ? <li style={{ padding: "10px 12px", color: "#64748b" }}>No status data yet.</li> : null}
          </ul>
        </article>

        <article style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
            <strong>Most Added To Cart</strong>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {data.mostAddedProducts.map((row) => (
              <li key={row.productId} style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>Product {row.productId.slice(0, 8)}...</p>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
                  {adminFormatters.number(row.quantity)} units in carts
                </p>
              </li>
            ))}
            {!data.mostAddedProducts.length ? <li style={{ padding: "10px 12px", color: "#64748b" }}>No cart activity yet.</li> : null}
          </ul>
        </article>

        <article style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
            <strong>Ratings Breakdown</strong>
          </div>
          <div style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
            {[5, 4, 3, 2, 1].map((star) => (
              <div key={star} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>{star} star</p>
                <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.ratingsBreakdown[star] || 0)}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
