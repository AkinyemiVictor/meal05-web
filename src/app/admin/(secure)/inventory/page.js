import Link from "next/link";
import { adminFormatters, loadInventoryMetrics } from "@/lib/admin-dashboard-data";
import AdminRestockControl from "@/components/admin-restock-control";

export const dynamic = "force-dynamic";

const toPositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
};

const buildPageHref = (params, nextPage) => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value == null || value === "") return;
    if (key === "page") return;
    query.set(key, String(value));
  });
  query.set("page", String(nextPage));
  const queryString = query.toString();
  return queryString ? `/admin/inventory?${queryString}` : "/admin/inventory";
};

const buildPaginationItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sorted = Array.from(pages)
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);

  const items = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) {
      if (value - previous === 2) {
        items.push(previous + 1);
      } else {
        items.push(`ellipsis-${previous}-${value}`);
      }
    }
    items.push(value);
    previous = value;
  }
  return items;
};

export default async function AdminInventoryPage({ searchParams }) {
  const params = (await searchParams) || {};
  const threshold = Math.max(1, Math.min(20, Number(params?.threshold || 5)));
  const pageSize = Math.max(10, Math.min(100, toPositiveInt(params?.pageSize, 20)));
  const data = await loadInventoryMetrics({ lowStockThreshold: threshold });

  const alertRows = [...data.outOfStock, ...data.lowStock];
  const totalAlerts = alertRows.length;
  const totalPages = Math.max(1, Math.ceil(totalAlerts / pageSize));
  const requestedPage = toPositiveInt(params?.page, 1);
  const page = Math.min(requestedPage, totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(totalAlerts, startIndex + pageSize);
  const rows = alertRows.slice(startIndex, endIndex);
  const prevHref = buildPageHref(params, Math.max(1, page - 1));
  const nextHref = buildPageHref(params, Math.min(totalPages, page + 1));
  const paginationItems = buildPaginationItems(page, totalPages);

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Inventory Dashboard</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Monitor low stock and out-of-stock items, then restock here. Use the Catalogue tab for price and season.
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
        <strong>Separated workflow.</strong>{" "}
        <Link href="/admin/catalogue" style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}>
          Open Catalogue
        </Link>{" "}
        for price and season changes across all items.
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
        <strong>Classified stock loss now has its own workflow.</strong>{" "}
        <Link href="/admin/inventory/losses" style={{ color: "#9a3412", fontWeight: 700, textDecoration: "underline" }}>
          Open Inventory Loss Tracking
        </Link>{" "}
        to record spoilage, expiry, damage, and other write-offs with database-backed history.
      </section>

      <section
        style={{
          marginBottom: 12,
          background: "#ecfdf5",
          border: "1px solid #bbf7d0",
          color: "#166534",
          borderRadius: 8,
          padding: "10px 12px",
        }}
      >
        <strong>Supplier planning now has its own workflow.</strong>{" "}
        <Link href="/admin/inventory/planning" style={{ color: "#166534", fontWeight: 700, textDecoration: "underline" }}>
          Open Supplier Restock Planning
        </Link>{" "}
        to track supplier assignment, purchase cost, lead time, last restock date, and expected arrivals.
      </section>

      {data.warnings.length ? (
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
          <strong>Some inventory data is partial.</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Total Tracked Items</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.totalTracked)}</p>
        </article>
        <article style={{ border: "1px solid #fecaca", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#991b1b", fontSize: 12 }}>Out Of Stock</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#991b1b" }}>{adminFormatters.number(data.outOfStockCount)}</p>
        </article>
        <article style={{ border: "1px solid #fde68a", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#92400e", fontSize: 12 }}>Low Stock (&lt;= {threshold})</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#92400e" }}>{adminFormatters.number(data.lowStockCount)}</p>
        </article>
        <article style={{ border: "1px solid #cbd5e1", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#475569", fontSize: 12 }}>Unknown Stock</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.unknownStockCount)}</p>
        </article>
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Alert Items</strong>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Item</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Stock</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Current</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Severity</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Restock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const severity = row.stock === 0 ? "Out of stock" : "Low stock";
                const tone = row.stock === 0 ? { bg: "#fee2e2", fg: "#991b1b" } : { bg: "#fef9c3", fg: "#854d0e" };
                return (
                  <tr key={String(row.id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>{row.name}</p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                        Product ID: {row.productId} | Variant ID: {row.id}
                        {row.unit ? ` | ${row.unit}` : ""}
                      </p>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        {row.isDefault ? (
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
                            Default
                          </span>
                        ) : null}
                        {!row.productActive ? (
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
                            Product Inactive
                          </span>
                        ) : null}
                        {!row.variantActive ? (
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
                            Variant Inactive
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ padding: 10 }}>{row.stock == null ? "-" : adminFormatters.number(row.stock)}</td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{adminFormatters.currency(row.price)}</p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                        {row.oldPrice != null && row.oldPrice > row.price
                          ? `Old price: ${adminFormatters.currency(row.oldPrice)}`
                          : "Old price not set"}
                      </p>
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 6,
                          background: row.productInSeason ? "#dcfce7" : "#fee2e2",
                          color: row.productInSeason ? "#166534" : "#991b1b",
                          borderRadius: 999,
                          padding: "3px 8px",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {row.productInSeason ? "In Season" : "Out Of Season"}
                      </span>
                    </td>
                    <td style={{ padding: 10 }}>
                      <span
                        style={{
                          background: tone.bg,
                          color: tone.fg,
                          borderRadius: 999,
                          padding: "3px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {severity}
                      </span>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <AdminRestockControl variantId={row.id} stockKnown={row.stock != null} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!rows.length ? <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No low stock alerts right now.</p> : null}

        {totalAlerts > 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              borderTop: "1px solid #e2e8f0",
              padding: "10px 12px",
              flexWrap: "wrap",
            }}
          >
            <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
              Showing {startIndex + 1}-{endIndex} of {totalAlerts}
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {page > 1 ? (
                <Link
                  href={prevHref}
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    padding: "6px 10px",
                    color: "#0f172a",
                    textDecoration: "none",
                  }}
                >
                  Previous
                </Link>
              ) : (
                <span style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", color: "#94a3b8" }}>
                  Previous
                </span>
              )}

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {paginationItems.map((item) => {
                  if (typeof item !== "number") {
                    return (
                      <span key={item} style={{ padding: "0 4px", color: "#64748b" }}>
                        ...
                      </span>
                    );
                  }

                  if (item === page) {
                    return (
                      <span
                        key={item}
                        style={{
                          border: "1px solid #0f172a",
                          background: "#0f172a",
                          color: "#ffffff",
                          borderRadius: 8,
                          padding: "6px 10px",
                          fontWeight: 700,
                          minWidth: 36,
                          textAlign: "center",
                        }}
                      >
                        {item}
                      </span>
                    );
                  }

                  return (
                    <Link
                      key={item}
                      href={buildPageHref(params, item)}
                      style={{
                        border: "1px solid #cbd5e1",
                        borderRadius: 8,
                        padding: "6px 10px",
                        color: "#0f172a",
                        textDecoration: "none",
                        minWidth: 36,
                        textAlign: "center",
                      }}
                    >
                      {item}
                    </Link>
                  );
                })}
              </div>

              {page < totalPages ? (
                <Link
                  href={nextHref}
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    padding: "6px 10px",
                    color: "#0f172a",
                    textDecoration: "none",
                  }}
                >
                  Next
                </Link>
              ) : (
                <span style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", color: "#94a3b8" }}>
                  Next
                </span>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
