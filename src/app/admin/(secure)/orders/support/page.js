import Link from "next/link";
import {
  adminFormatters,
  loadOrderSupportCaseMetrics,
  loadOrderSupportOrderCatalogue,
} from "@/lib/admin-dashboard-data";
import { ORDER_REFUND_STATUSES, ORDER_SUPPORT_CASE_STATUSES, ORDER_SUPPORT_CASE_TYPES } from "@/lib/order-support";
import AdminOrderSupportCaseControl from "@/components/admin-order-support-case-control";
import AdminManualRefundControl from "@/components/admin-manual-refund-control";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/admin/orders/support";

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

const caseStatusTone = (value) => {
  if (value === "resolved") return { bg: "#dcfce7", fg: "#166534" };
  if (value === "approved" || value === "reviewing") return { bg: "#fef3c7", fg: "#854d0e" };
  if (value === "rejected" || value === "cancelled") return { bg: "#fee2e2", fg: "#991b1b" };
  return { bg: "#dbeafe", fg: "#1d4ed8" };
};

export default async function AdminOrderSupportPage({ searchParams }) {
  const params = (await searchParams) || {};
  const query = String(params?.q || "").trim();
  const pageSize = Math.max(5, Math.min(50, toPositiveInt(params?.pageSize, 10)));
  const page = toPositiveInt(params?.page, 1);

  const typeValues = ["all", ...ORDER_SUPPORT_CASE_TYPES.map((option) => option.value)];
  const statusValues = ["all", ...ORDER_SUPPORT_CASE_STATUSES.map((option) => option.value)];
  const caseType = typeValues.includes(String(params?.caseType || "all")) ? String(params.caseType || "all") : "all";
  const caseStatus = statusValues.includes(String(params?.caseStatus || "all")) ? String(params.caseStatus || "all") : "all";
  const refundValues = ["all", ...ORDER_REFUND_STATUSES.map((option) => option.value)];
  const refundStatus = refundValues.includes(String(params?.refundStatus || "all")) ? String(params.refundStatus || "all") : "all";
  const casePageSize = Math.max(5, Math.min(50, toPositiveInt(params?.casePageSize, 10)));
  const casePage = toPositiveInt(params?.casePage, 1);

  const [orderCatalogue, caseMetrics] = await Promise.all([
    loadOrderSupportOrderCatalogue({ page, pageSize, query }),
    loadOrderSupportCaseMetrics({ page: casePage, pageSize: casePageSize, caseType, caseStatus, refundStatus }),
  ]);

  const warnings = Array.from(new Set([...(orderCatalogue.warnings || []), ...(caseMetrics.warnings || [])]));
  const orderStart = orderCatalogue.totalCount ? (orderCatalogue.page - 1) * orderCatalogue.pageSize + 1 : 0;
  const orderEnd = Math.min(orderCatalogue.totalCount, orderCatalogue.page * orderCatalogue.pageSize);
  const caseStart = caseMetrics.totalCount ? (caseMetrics.page - 1) * caseMetrics.pageSize + 1 : 0;
  const caseEnd = Math.min(caseMetrics.totalCount, caseMetrics.page * caseMetrics.pageSize);

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Returns, Refunds, Replacements</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Track customer support cases against orders with explicit refund, return, and replacement states.
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
        <strong>Main order status updates stay on the orders screen.</strong>{" "}
        <Link href="/admin/orders" style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}>
          Return to Orders
        </Link>
      </section>

      <section style={{ marginBottom: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", borderRadius: 8, padding: "10px 12px" }}>
        <strong>Refunds are manual bank transfers.</strong>{" "}
        Meal05 never sends money from this screen. Transfer from your bank app first, then use <em>Mark as refunded</em> to create the audit record, or choose <em>No refund required</em>.
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
          <strong>Some support-case data is partial.</strong>
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
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Tracked Cases</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.number(caseMetrics.totalCases)}</p>
        </article>
        <article style={{ border: "1px solid #dbeafe", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#1d4ed8", fontSize: 12 }}>Open</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#1d4ed8" }}>{adminFormatters.number(caseMetrics.openCount)}</p>
        </article>
        <article style={{ border: "1px solid #fef3c7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#854d0e", fontSize: 12 }}>Reviewing</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#854d0e" }}>{adminFormatters.number(caseMetrics.reviewingCount)}</p>
        </article>
        <article style={{ border: "1px solid #dcfce7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#166534", fontSize: 12 }}>Resolved</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#166534" }}>{adminFormatters.number(caseMetrics.resolvedCount)}</p>
        </article>
        <article style={{ border: "1px solid #ede9fe", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#6d28d9", fontSize: 12 }}>Manually Refunded</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#6d28d9" }}>{adminFormatters.currency(caseMetrics.totalRefundAmount)}</p>
        </article>
        <article style={{ border: "1px solid #fef3c7", borderRadius: 10, background: "#ffffff", padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#854d0e", fontSize: 12 }}>Awaiting Transfer</p>
          <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#854d0e" }}>{adminFormatters.number(caseMetrics.pendingRefundCount)}</p>
        </article>
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", marginBottom: 16 }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Create Support Case</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Search recent orders and attach a refund, return, or replacement workflow to the correct order.
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
            placeholder="Search order id, customer, or status"
            style={{ minWidth: 260, flex: "1 1 320px", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          />
          <select name="pageSize" defaultValue={String(pageSize)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            <option value="10">10 rows</option>
            <option value="20">20 rows</option>
            <option value="40">40 rows</option>
          </select>
          <button
            type="submit"
            style={{ border: "1px solid #0f172a", borderRadius: 8, background: "#0f172a", color: "#ffffff", padding: "8px 12px", fontSize: 14, fontWeight: 600 }}
          >
            Filter
          </button>
        </form>

        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>
          Showing {orderCatalogue.totalCount ? `${orderStart}-${orderEnd}` : "0"} of {orderCatalogue.totalCount} orders.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Order</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Customer</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Amount</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Current Status</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Support History</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Create Case</th>
              </tr>
            </thead>
            <tbody>
              {orderCatalogue.records.map((row) => (
                <tr key={String(row.id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <strong>#{row.id}</strong>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>{adminFormatters.dateTime(row.createdAt)}</p>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>{row.customer}</td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>{adminFormatters.currency(row.total)}</td>
                  <td style={{ padding: 10, verticalAlign: "top", fontSize: 12 }}>
                    <p style={{ margin: 0 }}>Order: <strong>{row.status}</strong></p>
                    <p style={{ margin: "4px 0 0" }}>Payment: <strong>{row.paymentStatus}</strong></p>
                    <p style={{ margin: "4px 0 0" }}>Delivery: <strong>{row.deliveryStatus || "-"}</strong></p>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{adminFormatters.number(row.supportCaseCount)}</p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                      Open: {adminFormatters.number(row.openSupportCaseCount)}
                    </p>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <AdminOrderSupportCaseControl orderId={row.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!orderCatalogue.records.length ? <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No orders match the current filter.</p> : null}

        <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "#64748b", fontSize: 13 }}>Page {orderCatalogue.page} of {orderCatalogue.totalPages}</span>
          <Pager params={params} pageKey="page" page={orderCatalogue.page} totalPages={orderCatalogue.totalPages} />
        </div>
      </section>

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Support Case Queue</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Review, update, and resolve the current refund, return, and replacement cases.
          </p>
        </div>

        <form
          method="GET"
          style={{ padding: 12, borderBottom: "1px solid #e2e8f0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        >
          <PreservedParams params={params} exclude={["casePage", "casePageSize", "caseType", "caseStatus", "refundStatus"]} />
          <input type="hidden" name="casePage" value="1" />
          <select name="caseType" defaultValue={caseType} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            <option value="all">All case types</option>
            {ORDER_SUPPORT_CASE_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select name="caseStatus" defaultValue={caseStatus} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            <option value="all">All statuses</option>
            {ORDER_SUPPORT_CASE_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select name="refundStatus" defaultValue={refundStatus} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            <option value="all">All refund decisions</option>
            {ORDER_REFUND_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select name="casePageSize" defaultValue={String(casePageSize)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
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

        {!caseMetrics.schemaAvailable ? (
          <div style={{ margin: 12, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 8, padding: "10px 12px" }}>
            Support cases will appear here after the support-case migration is applied.
          </div>
        ) : (
          <>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>
              Showing {caseMetrics.totalCount ? `${caseStart}-${caseEnd}` : "0"} of {caseMetrics.totalCount} support cases.
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1480 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Order</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Customer</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Case</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Reason</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Tracked Refund</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Status</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Refund Decision</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Requested</th>
                    <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Update</th>
                  </tr>
                </thead>
                <tbody>
                  {caseMetrics.records.map((row) => {
                    const tone = caseStatusTone(row.caseStatus);
                    return (
                      <tr key={String(row.id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: 10, verticalAlign: "top" }}>
                          <strong>#{row.orderId}</strong>
                          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>{adminFormatters.currency(row.orderTotal)}</p>
                        </td>
                        <td style={{ padding: 10, verticalAlign: "top" }}>{row.customer}</td>
                        <td style={{ padding: 10, verticalAlign: "top", fontSize: 12 }}>
                          <p style={{ margin: 0, fontWeight: 700 }}>{row.caseTypeLabel}</p>
                          {row.replacementOrderId ? <p style={{ margin: "4px 0 0" }}>Replacement: {row.replacementOrderId}</p> : null}
                        </td>
                        <td style={{ padding: 10, verticalAlign: "top", fontSize: 12 }}>
                          <p style={{ margin: 0 }}>{row.reason}</p>
                          {row.adminNote ? <p style={{ margin: "4px 0 0", color: "#64748b" }}>{row.adminNote}</p> : null}
                        </td>
                        <td style={{ padding: 10, verticalAlign: "top" }}>{adminFormatters.currency(row.refundAmount)}</td>
                        <td style={{ padding: 10, verticalAlign: "top" }}>
                          <span style={{ background: tone.bg, color: tone.fg, borderRadius: 999, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>
                            {row.caseStatusLabel}
                          </span>
                        </td>
                        <td style={{ padding: 10, verticalAlign: "top" }}>
                          {row.caseType === "refund" ? (
                            <AdminManualRefundControl
                              caseId={row.id}
                              refundStatus={row.refundStatus}
                              refundAmount={row.refundAmount}
                              refundReference={row.refundReference}
                              refundedAt={row.refundedAt}
                              refundedByEmail={row.refundedByEmail}
                            />
                          ) : <span style={{ color: "#64748b", fontSize: 12 }}>Not applicable</span>}
                        </td>
                        <td style={{ padding: 10, verticalAlign: "top", fontSize: 12 }}>
                          <p style={{ margin: 0 }}>{adminFormatters.dateTime(row.requestedAt)}</p>
                          {row.createdByEmail ? <p style={{ margin: "4px 0 0", color: "#64748b" }}>{row.createdByEmail}</p> : null}
                        </td>
                        <td style={{ padding: 10, verticalAlign: "top" }}>
                          <AdminOrderSupportCaseControl
                            orderId={row.orderId}
                            caseId={row.id}
                            caseType={row.caseType}
                            caseStatus={row.caseStatus}
                            refundAmount={row.refundAmount}
                            reason={row.reason}
                            adminNote={row.adminNote}
                            replacementOrderId={row.replacementOrderId}
                            refundStatus={row.refundStatus}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!caseMetrics.records.length ? <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No support cases match the current filters.</p> : null}

            <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ color: "#64748b", fontSize: 13 }}>Page {caseMetrics.page} of {caseMetrics.totalPages}</span>
              <Pager params={params} pageKey="casePage" page={caseMetrics.page} totalPages={caseMetrics.totalPages} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
