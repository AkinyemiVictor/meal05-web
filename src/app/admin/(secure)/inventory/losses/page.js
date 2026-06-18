import Link from "next/link";
import {
  adminFormatters,
  loadInventoryLossCatalogue,
  loadInventoryLossMetrics,
} from "@/lib/admin-dashboard-data";
import { INVENTORY_LOSS_FILTER_OPTIONS } from "@/lib/inventory-loss";
import AdminInventoryLossControl from "@/components/admin-inventory-loss-control";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/inventory/losses";

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

const lossTone = (lossType) => {
  if (lossType === "expiry") return { bg: "#fef3c7", fg: "#854d0e" };
  if (lossType === "damage") return { bg: "#fee2e2", fg: "#991b1b" };
  if (lossType === "quality_rejection") return { bg: "#dbeafe", fg: "#1d4ed8" };
  if (lossType === "sampling") return { bg: "#ede9fe", fg: "#6d28d9" };
  if (lossType === "theft") return { bg: "#111827", fg: "#ffffff" };
  if (lossType === "other") return { bg: "#e5e7eb", fg: "#374151" };
  return { bg: "#ffedd5", fg: "#9a3412" };
};

function Pager({ params, pageKey, page, totalPages }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Link
        href={buildPageHref(params, { [pageKey]: Math.max(1, page - 1) })}
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
        href={buildPageHref(params, { [pageKey]: Math.min(totalPages, page + 1) })}
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

export default async function AdminInventoryLossPage({ searchParams }) {
  const params = (await searchParams) || {};
  const query = String(params?.q || "").trim();
  const pageSize = Math.max(5, Math.min(50, toPositiveInt(params?.pageSize, 12)));
  const page = toPositiveInt(params?.page, 1);

  const days = Math.max(7, Math.min(180, Number(params?.days || 30)));
  const typeValues = INVENTORY_LOSS_FILTER_OPTIONS.map((option) => option.value);
  const type = typeValues.includes(String(params?.type || "all")) ? String(params.type || "all") : "all";
  const logPageSize = Math.max(5, Math.min(50, toPositiveInt(params?.logPageSize, 10)));
  const logPage = toPositiveInt(params?.logPage, 1);

  const [catalogue, metrics] = await Promise.all([
    loadInventoryLossCatalogue({ page, pageSize, query }),
    loadInventoryLossMetrics({ days, page: logPage, pageSize: logPageSize, type }),
  ]);

  const warnings = Array.from(new Set([...(catalogue.warnings || []), ...(metrics.warnings || [])]));
  const spoilageUnits = metrics.breakdown.find((entry) => entry.lossType === "spoilage")?.quantity || 0;
  const expiryUnits = metrics.breakdown.find((entry) => entry.lossType === "expiry")?.quantity || 0;
  const recordStart = catalogue.totalCount ? (catalogue.page - 1) * catalogue.pageSize + 1 : 0;
  const recordEnd = Math.min(catalogue.totalCount, catalogue.page * catalogue.pageSize);
  const logStart = metrics.totalCount ? (metrics.page - 1) * metrics.pageSize + 1 : 0;
  const logEnd = Math.min(metrics.totalCount, metrics.page * metrics.pageSize);

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Inventory Loss Tracking</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Record spoilage, expiry, damage, and other write-offs with stock updates backed by the database.
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
        <strong>Restock stays on the main inventory screen.</strong>{" "}
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
          <strong>Some inventory loss data is partial.</strong>
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
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>In-Stock Variants</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(catalogue.totalInStockVariants)}</p>
        </article>
        <article style={{ border: "1px solid #fecaca", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#991b1b", fontSize: 12 }}>Units Lost ({metrics.windowDays}d)</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#991b1b" }}>{adminFormatters.number(metrics.totalUnitsLost)}</p>
        </article>
        <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Loss Events ({metrics.windowDays}d)</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(metrics.totalEvents)}</p>
        </article>
        <article style={{ border: "1px solid #ffedd5", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#9a3412", fontSize: 12 }}>Spoilage Units</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#9a3412" }}>{adminFormatters.number(spoilageUnits)}</p>
        </article>
        <article style={{ border: "1px solid #fef3c7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#854d0e", fontSize: 12 }}>Expiry Units</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#854d0e" }}>{adminFormatters.number(expiryUnits)}</p>
        </article>
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", marginBottom: 16 }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Record Loss</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Search any in-stock variant and record the quantity being written off.
          </p>
        </div>
        <form
          method="GET"
          style={{ padding: 12, borderBottom: "1px solid #e2e8f0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        >
          <PreservedParams params={params} exclude={["page", "pageSize", "q"]} />
          <input type="hidden" name="page" value="1" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search product or variant"
            style={{ minWidth: 240, flex: "1 1 280px", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          />
          <select
            name="pageSize"
            defaultValue={String(pageSize)}
            style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          >
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
          Showing {catalogue.totalCount ? `${recordStart}-${recordEnd}` : "0"} of {catalogue.totalCount} in-stock variants.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Product</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Variant</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Stock</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {catalogue.records.map((row) => (
                <tr key={`${row.productId}-${row.variantId}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{row.productName}</p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Product ID: {row.productId}</p>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{row.variantName}</p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                      Variant ID: {row.variantId}
                      {row.unit ? ` | ${row.unit}` : ""}
                    </p>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top", fontWeight: 700 }}>{adminFormatters.number(row.stockCount)}</td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <AdminInventoryLossControl variantId={row.variantId} stockCount={row.stockCount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!catalogue.records.length ? <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No in-stock variants match the current filter.</p> : null}

        <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "#64748b", fontSize: 13 }}>Page {catalogue.page} of {catalogue.totalPages}</span>
          <Pager params={params} pageKey="page" page={catalogue.page} totalPages={catalogue.totalPages} />
        </div>
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Recent Loss Events</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Review the write-off history and filter it by time window or loss type.
          </p>
        </div>

        <form
          method="GET"
          style={{ padding: 12, borderBottom: "1px solid #e2e8f0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        >
          <PreservedParams params={params} exclude={["logPage", "logPageSize", "days", "type"]} />
          <input type="hidden" name="logPage" value="1" />
          <select name="days" defaultValue={String(days)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 180 days</option>
          </select>
          <select name="type" defaultValue={type} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            {INVENTORY_LOSS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select name="logPageSize" defaultValue={String(logPageSize)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            <option value="10">10 rows</option>
            <option value="20">20 rows</option>
            <option value="40">40 rows</option>
          </select>
          <button
            type="submit"
            style={{ border: "1px solid #0f172a", borderRadius: 8, background: "#0f172a", color: "#ffffff", padding: "8px 12px", fontSize: 14, fontWeight: 600 }}
          >
            Apply
          </button>
        </form>

        {!metrics.schemaAvailable ? (
          <div style={{ margin: 12, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 8, padding: "10px 12px" }}>
            Inventory loss metrics will appear here after the inventory loss migration is applied.
          </div>
        ) : (
          <>
            <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #e2e8f0" }}>
              {metrics.breakdown.length ? metrics.breakdown.map((entry) => {
                const tone = lossTone(entry.lossType);
                return (
                  <span key={entry.lossType} style={{ borderRadius: 999, background: tone.bg, color: tone.fg, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>
                    {entry.label}: {adminFormatters.number(entry.quantity)}
                  </span>
                );
              }) : <span style={{ color: "#64748b", fontSize: 13 }}>No recorded loss events in this window.</span>}
            </div>

            <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>
              Showing {metrics.totalCount ? `${logStart}-${logEnd}` : "0"} of {metrics.totalCount} loss events.
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Item</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Type</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Quantity</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Recorded</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Note</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.records.map((row) => {
                    const tone = lossTone(row.lossType);
                    return (
                      <tr key={String(row.id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: 10, verticalAlign: "top" }}>
                          <p style={{ margin: 0, fontWeight: 600 }}>{row.productName}</p>
                          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                            {row.variantName}
                            {row.unit ? ` | ${row.unit}` : ""}
                          </p>
                        </td>
                        <td style={{ padding: 10, verticalAlign: "top" }}>
                          <span style={{ background: tone.bg, color: tone.fg, borderRadius: 999, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>
                            {row.lossTypeLabel}
                          </span>
                        </td>
                        <td style={{ padding: 10, verticalAlign: "top", fontWeight: 700 }}>-{adminFormatters.number(row.quantity)}</td>
                        <td style={{ padding: 10, verticalAlign: "top" }}>{adminFormatters.dateTime(row.occurredAt)}</td>
                        <td style={{ padding: 10, verticalAlign: "top", color: "#334155", fontSize: 13 }}>{row.note || "-"}</td>
                        <td style={{ padding: 10, verticalAlign: "top", color: "#475569", fontSize: 13 }}>{row.recordedByEmail || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!metrics.records.length ? <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No loss events match the current filters.</p> : null}

            <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ color: "#64748b", fontSize: 13 }}>Page {metrics.page} of {metrics.totalPages}</span>
              <Pager params={params} pageKey="logPage" page={metrics.page} totalPages={metrics.totalPages} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
