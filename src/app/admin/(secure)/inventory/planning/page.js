import Link from "next/link";
import { adminFormatters, loadSupplierRestockPlanningData } from "@/lib/admin-dashboard-data";
import {
  getRestockPlanningMissingFieldLabel,
  normalizeSupplierRestockFilter,
  SUPPLIER_RESTOCK_FILTER_OPTIONS,
} from "@/lib/supplier-restock-planning";
import AdminRestockPlanningControl from "@/components/admin-restock-planning-control";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/inventory/planning";

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

const scheduleTone = (code) => {
  if (code === "overdue") return { bg: "#fee2e2", fg: "#991b1b" };
  if (code === "due_today" || code === "due_soon") return { bg: "#fef3c7", fg: "#92400e" };
  if (code === "scheduled") return { bg: "#dbeafe", fg: "#1d4ed8" };
  return { bg: "#e5e7eb", fg: "#334155" };
};

const formatDate = (value) => {
  const text = String(value || "").trim();
  if (!text) return "-";
  const ms = Date.parse(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return text;
  return new Date(ms).toLocaleDateString("en-NG", { dateStyle: "medium" });
};

export default async function AdminInventoryPlanningPage({ searchParams }) {
  const params = (await searchParams) || {};
  const query = String(params?.q || "").trim();
  const pageSize = Math.max(5, Math.min(50, toPositiveInt(params?.pageSize, 12)));
  const page = toPositiveInt(params?.page, 1);
  const filter = normalizeSupplierRestockFilter(params?.filter);

  const data = await loadSupplierRestockPlanningData({ page, pageSize, query, filter });
  const warnings = Array.from(new Set(data.warnings || []));
  const recordStart = data.totalCount ? (data.page - 1) * data.pageSize + 1 : 0;
  const recordEnd = Math.min(data.totalCount, data.page * data.pageSize);

  return (
    <main style={{ maxWidth: 1240, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Supplier Restock Planning</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Track supplier ownership, purchase cost, lead time, and planned restock dates for each variant.
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
        <strong>Immediate stock actions stay on the main inventory screen.</strong>{" "}
        <Link href="/admin/inventory" style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}>
          Return to Inventory
        </Link>
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
          <strong>Some supplier planning data is partial.</strong>
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
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Tracked Variants</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.totalVariants)}</p>
        </article>
        <article style={{ border: "1px solid #dcfce7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#166534", fontSize: 12 }}>Active Suppliers</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#166534" }}>{adminFormatters.number(data.activeSuppliers)}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#475569", fontSize: 12 }}>Variants With Supplier</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(data.assignedSupplierCount)}</p>
        </article>
        <article style={{ border: "1px solid #fee2e2", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#991b1b", fontSize: 12 }}>Missing Supplier</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#991b1b" }}>{adminFormatters.number(data.missingSupplierCount)}</p>
        </article>
        <article style={{ border: "1px solid #fff7ed", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#9a3412", fontSize: 12 }}>Missing Plan Fields</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#9a3412" }}>{adminFormatters.number(data.missingPlanCount)}</p>
        </article>
        <article style={{ border: "1px solid #fecaca", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#991b1b", fontSize: 12 }}>Overdue Restocks</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#991b1b" }}>{adminFormatters.number(data.overdueCount)}</p>
        </article>
        <article style={{ border: "1px solid #fef3c7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#92400e", fontSize: 12 }}>Due Soon</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#92400e" }}>{adminFormatters.number(data.dueSoonCount)}</p>
        </article>
        <article style={{ border: "1px solid #dbeafe", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#1d4ed8", fontSize: 12 }}>Order Now</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#1d4ed8" }}>{adminFormatters.number(data.orderNowCount)}</p>
        </article>
      </section>

      {!data.schemaAvailable ? (
        <section
          style={{
            marginBottom: 16,
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1d4ed8",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          Supplier planning metrics will appear here after the supplier planning migration is applied.
        </section>
      ) : null}

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Variant Planning Queue</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Filter variants by supplier coverage, scheduling risk, or procurement urgency.
          </p>
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
            placeholder="Search product, variant, or supplier"
            style={{ minWidth: 240, flex: "1 1 280px", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          />
          <select name="filter" defaultValue={filter} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            {SUPPLIER_RESTOCK_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select name="pageSize" defaultValue={String(pageSize)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            <option value="12">12 rows</option>
            <option value="24">24 rows</option>
            <option value="48">48 rows</option>
          </select>
          <button
            type="submit"
            style={{ border: "1px solid #0f172a", borderRadius: 8, background: "#0f172a", color: "#ffffff", padding: "8px 12px", fontSize: 14, fontWeight: 600 }}
          >
            Filter
          </button>
        </form>

        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>
          Showing {data.totalCount ? `${recordStart}-${recordEnd}` : "0"} of {data.totalCount} variants.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1220 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Item</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Stock</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Supplier</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Planning</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Update</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((row) => {
                const tone = scheduleTone(row.scheduleCode);
                return (
                  <tr key={`${row.productId}-${row.variantId}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>{row.productName}</p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                        {row.variantName}
                        {row.unit ? ` | ${row.unit}` : ""}
                      </p>
                      <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: 12 }}>
                        Product ID: {row.productId} | Variant ID: {row.variantId}
                      </p>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        {row.isDefault ? (
                          <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                            Default
                          </span>
                        ) : null}
                        {!row.productActive ? (
                          <span style={{ background: "#e5e7eb", color: "#374151", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                            Product Inactive
                          </span>
                        ) : null}
                        {!row.variantActive ? (
                          <span style={{ background: "#e5e7eb", color: "#374151", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                            Variant Inactive
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>
                        {row.stockCount == null ? "-" : adminFormatters.number(row.stockCount)}
                      </p>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>{row.supplierName || "Unassigned"}</p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                        Purchase cost: {row.purchaseCost == null ? "-" : adminFormatters.currency(row.purchaseCost)}
                      </p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                        Lead time: {row.leadTimeDays == null ? "-" : `${adminFormatters.number(row.leadTimeDays)} day${row.leadTimeDays === 1 ? "" : "s"}`}
                      </p>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <span
                        style={{
                          display: "inline-block",
                          background: tone.bg,
                          color: tone.fg,
                          borderRadius: 999,
                          padding: "3px 8px",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {row.scheduleLabel}
                      </span>
                      <p style={{ margin: "8px 0 0", color: "#334155", fontSize: 13 }}>
                        Last restock: {formatDate(row.lastRestockDate)}
                      </p>
                      <p style={{ margin: "4px 0 0", color: "#334155", fontSize: 13 }}>
                        Expected restock: {formatDate(row.expectedRestockDate)}
                      </p>
                      <p style={{ margin: "4px 0 0", color: row.orderNow ? "#1d4ed8" : "#334155", fontSize: 13, fontWeight: row.orderNow ? 700 : 400 }}>
                        Order by: {formatDate(row.orderByDate)}
                      </p>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        {row.missingFields.map((field) => (
                          <span
                            key={field}
                            style={{
                              background: "#fff7ed",
                              color: "#9a3412",
                              borderRadius: 999,
                              padding: "2px 8px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            Missing {getRestockPlanningMissingFieldLabel(field)}
                          </span>
                        ))}
                        {row.orderNow ? (
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
                            Place Order Now
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "top" }}>
                      <AdminRestockPlanningControl
                        variantId={row.variantId}
                        supplierName={row.supplierName}
                        purchaseCost={row.purchaseCost}
                        leadTimeDays={row.leadTimeDays}
                        lastRestockDate={row.lastRestockDate}
                        expectedRestockDate={row.expectedRestockDate}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!data.records.length ? (
          <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No variants match the current supplier planning filters.</p>
        ) : null}

        <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "#64748b", fontSize: 13 }}>Page {data.page} of {data.totalPages}</span>
          <Pager params={params} page={data.page} totalPages={data.totalPages} />
        </div>
      </section>
    </main>
  );
}
