import Link from "next/link";
import { adminFormatters, loadProductPerformanceMetrics, loadProductReferenceData } from "@/lib/admin-dashboard-data";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const days = Math.max(7, Math.min(120, Number(params?.days || 30)));
  const [performance, reference] = await Promise.all([
    loadProductPerformanceMetrics({ days }),
    loadProductReferenceData(),
  ]);
  const unsoldTotal = Number(performance.totalUnsoldProducts ?? performance.unsold.length);
  const trackedProducts = Number(performance.totalProductsTracked || 0);
  const warnings = [...performance.warnings, ...reference.warnings];

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Products</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Product performance and sales visibility live here. Use the Catalogue tab for stock, price, and season changes.
        </p>
      </header>

      <section
        style={{
          marginBottom: 12,
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          color: "#1d4ed8",
          borderRadius: 8,
          padding: "10px 12px",
        }}
      >
        <strong>Editing moved.</strong>{" "}
        <Link href="/admin/catalogue" style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}>
          Open Catalogue
        </Link>{" "}
        for restock, price control, and season control.
      </section>

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
        <strong>Data quality queue.</strong>{" "}
        <Link href="/admin/products/quality" style={{ color: "#9a3412", fontWeight: 700, textDecoration: "underline" }}>
          Open Product Data Quality
        </Link>{" "}
        to fix missing images, units, packaging, prices, season values, and promo state.
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", marginBottom: 12 }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Product Reference Values</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Live reference values currently exposed by the Supabase product schema.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
            padding: 12,
          }}
        >
          <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", background: "#f8fafc" }}>
            <p style={{ margin: 0, color: "#475569", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Packaging Material Types
            </p>
            <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 13 }}>
              {reference.packagingSource
                ? `Source: ${reference.packagingSource}`
                : "No packaging material type field or table is available in the current public schema."}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {reference.packagingMaterialTypes.length ? (
                reference.packagingMaterialTypes.map((value) => (
                  <span
                    key={value}
                    style={{
                      borderRadius: 999,
                      background: "#dbeafe",
                      color: "#1d4ed8",
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {value}
                  </span>
                ))
              ) : (
                <span
                  style={{
                    borderRadius: 999,
                    background: "#e5e7eb",
                    color: "#374151",
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Not available
                </span>
              )}
            </div>
          </article>

          <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", background: "#f8fafc" }}>
            <p style={{ margin: 0, color: "#475569", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Measurement Units
            </p>
            <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 13 }}>
              {reference.measurementSource ? `Source: ${reference.measurementSource}` : "No measurement unit field found."}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {reference.measurementUnits.length ? (
                reference.measurementUnits.map((value) => (
                  <span
                    key={value}
                    style={{
                      borderRadius: 999,
                      background: "#dcfce7",
                      color: "#166534",
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {value}
                  </span>
                ))
              ) : (
                <span
                  style={{
                    borderRadius: 999,
                    background: "#e5e7eb",
                    color: "#374151",
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Not available
                </span>
              )}
            </div>
          </article>
        </div>
      </section>

      {warnings.length ? (
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
          <strong>Some product data is partial.</strong>
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
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Tracked Products</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(trackedProducts)}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Products With Sales</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(performance.totalSoldProducts)}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Unsold Products</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(unsoldTotal)}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Analysis Window</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{days} days</p>
        </article>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
            <strong>Top Products By Revenue</strong>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {performance.topByRevenue.slice(0, 12).map((row) => (
              <li key={row.productId} style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>{row.name}</p>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
                  {adminFormatters.number(row.unitsSold)} units | {adminFormatters.currency(row.revenue)}
                </p>
              </li>
            ))}
            {!performance.topByRevenue.length ? (
              <li style={{ padding: "10px 12px", color: "#64748b" }}>No paid order data yet.</li>
            ) : null}
          </ul>
        </article>

        <article style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
            <strong>Low Performing (With Sales)</strong>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {performance.lowPerformers.slice(0, 12).map((row) => (
              <li key={row.productId} style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>{row.name}</p>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
                  {adminFormatters.number(row.unitsSold)} units | {adminFormatters.currency(row.revenue)}
                </p>
              </li>
            ))}
            {!performance.lowPerformers.length ? (
              <li style={{ padding: "10px 12px", color: "#64748b" }}>No low performers yet.</li>
            ) : null}
          </ul>
        </article>

        <article style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
            <strong>Unsold In Last {days} Days</strong>
            {unsoldTotal > 0 ? (
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                Showing {adminFormatters.number(performance.unsold.length)} of {adminFormatters.number(unsoldTotal)}
              </p>
            ) : null}
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 560, overflowY: "auto" }}>
            {performance.unsold.map((row) => (
              <li key={row.productId} style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>{row.name}</p>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Product ID: {row.productId}</p>
              </li>
            ))}
            {!unsoldTotal ? (
              <li style={{ padding: "10px 12px", color: "#64748b" }}>All listed products have recent sales.</li>
            ) : null}
          </ul>
        </article>
      </section>
    </main>
  );
}
