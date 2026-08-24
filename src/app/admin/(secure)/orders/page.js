import Link from "next/link";
import {
  adminFormatters,
  loadOrderAdminDetail,
  loadOrderExceptionQueue,
  loadOrderSupportOrderCatalogue,
} from "@/lib/admin-dashboard-data";
import AdminOrderStatusControl from "@/components/admin-order-status-control";
import AdminOrderSupportCaseControl from "@/components/admin-order-support-case-control";
import AdminOrderRiderAssignment from "@/components/admin-order-rider-assignment";
import { loadOrderDeliveryAssignment, loadRiderDirectory } from "@/lib/delivery/riders";

export const dynamic = "force-dynamic";

const EXCEPTION_OPTIONS = ["all", "monitor", "at_risk", "overdue", "critical"];
const ORDER_STATUS_FILTERS = ["all", "pending", "confirmed", "processing", "ready_for_dispatch", "dispatched", "shipped", "delivered", "completed", "stock_failed", "payment_failed", "cancelled"];
const PAYMENT_STATUS_FILTERS = ["all", "awaiting_payment", "awaiting_confirmation", "confirmed", "rejected", "pending", "processing", "paid", "failed", "refunded", "unpaid"];
const DELIVERY_STATUS_FILTERS = ["all", "awaiting dispatch", "dispatched", "in transit", "delayed", "delivered", "completed", "returned"];

const toPositiveInt = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return fallback;
  return Math.floor(numeric);
};

const textStatus = (value) =>
  String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const buildHref = (params, updates = {}) => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (key in updates) return;
    if (value == null || value === "") return;
    query.set(key, String(value));
  });
  Object.entries(updates).forEach(([key, value]) => {
    if (value == null || value === "" || value === "all") return;
    query.set(key, String(value));
  });
  const queryString = query.toString();
  return queryString ? `/admin/orders?${queryString}` : "/admin/orders";
};

function PreservedParams({ params, exclude = [] }) {
  return Object.entries(params || {}).map(([key, value]) => {
    if (exclude.includes(key)) return null;
    if (value == null || value === "") return null;
    return <input key={key} type="hidden" name={key} value={String(value)} />;
  });
}

function Pager({ params, pageKey, page, totalPages, label = "Page" }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ color: "#64748b", fontSize: 13 }}>
        {label} {page} of {totalPages}
      </span>
      <Link
        href={buildHref(params, { [pageKey]: Math.max(1, page - 1) })}
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
        href={buildHref(params, { [pageKey]: Math.min(totalPages, page + 1) })}
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

const getFilterCount = (data, option) => {
  if (!data) return 0;
  if (option === "all") return Number(data.totalExceptions || 0);
  if (option === "critical") return Number(data.criticalCount || 0);
  if (option === "overdue") return Number(data.overdueCount || 0);
  if (option === "at_risk") return Number(data.atRiskCount || 0);
  if (option === "monitor") return Number(data.monitorCount || 0);
  return 0;
};

const issueAgeTone = (issueAgeHours) => {
  if (Number.isFinite(issueAgeHours) && issueAgeHours >= 48) return { bg: "#fee2e2", fg: "#991b1b", label: "Critical" };
  if (Number.isFinite(issueAgeHours) && issueAgeHours >= 24) return { bg: "#ffedd5", fg: "#9a3412", label: "Overdue" };
  if (Number.isFinite(issueAgeHours) && issueAgeHours >= 6) return { bg: "#fef3c7", fg: "#854d0e", label: "At Risk" };
  return { bg: "#e5e7eb", fg: "#475569", label: "Monitor" };
};

const filterTone = (option) => {
  if (option === "critical") return { border: "#fecaca", bg: "#fee2e2", fg: "#991b1b" };
  if (option === "overdue") return { border: "#fed7aa", bg: "#ffedd5", fg: "#9a3412" };
  if (option === "at_risk") return { border: "#fde68a", bg: "#fef3c7", fg: "#854d0e" };
  if (option === "monitor") return { border: "#e2e8f0", bg: "#e5e7eb", fg: "#475569" };
  return { border: "#cbd5e1", bg: "#f8fafc", fg: "#0f172a" };
};

const statusPillStyle = (value) => {
  const normalized = String(value || "").toLowerCase();
  if (["confirmed", "paid", "delivered", "completed"].includes(normalized)) return { bg: "#dcfce7", fg: "#166534" };
  if (["awaiting_payment", "awaiting_confirmation", "pending", "processing", "ready_for_dispatch", "shipped", "in transit", "awaiting dispatch", "dispatched"].includes(normalized)) return { bg: "#fef3c7", fg: "#854d0e" };
  if (["rejected", "failed", "cancelled", "stock_failed", "payment_failed", "returned", "delayed"].includes(normalized)) return { bg: "#fee2e2", fg: "#991b1b" };
  return { bg: "#e5e7eb", fg: "#475569" };
};

function StatusPill({ value }) {
  const tone = statusPillStyle(value);
  return (
    <span style={{ background: tone.bg, color: tone.fg, borderRadius: 999, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>
      {value ? textStatus(value) : "-"}
    </span>
  );
}

function OrderStatusBlock({ row }) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <StatusPill value={row.status} />
        <StatusPill value={row.paymentStatus} />
        <StatusPill value={row.deliveryStatus} />
      </div>
      <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>
        Payment: {row.paymentMethod || "unknown"} {row.paymentIsManual ? "(manual)" : "(gateway)"}
      </p>
    </div>
  );
}

export default async function AdminOrdersPage({ searchParams }) {
  const params = (await searchParams) || {};
  const query = String(params?.q || "").trim();
  const listPage = toPositiveInt(params?.page, 1);
  const listPageSize = Math.max(10, Math.min(100, toPositiveInt(params?.pageSize, 20)));
  const status = ORDER_STATUS_FILTERS.includes(String(params?.status || "all")) ? String(params.status || "all") : "all";
  const paymentStatus = PAYMENT_STATUS_FILTERS.includes(String(params?.paymentStatus || "all")) ? String(params.paymentStatus || "all") : "all";
  const deliveryStatus = DELIVERY_STATUS_FILTERS.includes(String(params?.deliveryStatus || "all")) ? String(params.deliveryStatus || "all") : "all";
  const selectedOrderId = String(params?.orderId || "").trim();
  const exception = EXCEPTION_OPTIONS.includes(String(params?.exception || "all")) ? String(params.exception || "all") : "all";
  const exceptionPage = Math.max(1, Number(params?.exceptionPage || 1));

  const [ordersData, selectedDetail, exceptionData, riderData, deliveryAssignment] = await Promise.all([
    loadOrderSupportOrderCatalogue({
      page: listPage,
      pageSize: listPageSize,
      query,
      status,
      paymentStatus,
      deliveryStatus,
    }),
    selectedOrderId ? loadOrderAdminDetail(selectedOrderId) : Promise.resolve({ order: null, items: [], supportCases: [], warnings: [] }),
    loadOrderExceptionQueue({ category: exception, page: exceptionPage, pageSize: 12 }),
    selectedOrderId ? loadRiderDirectory({ activeOnly: true }) : Promise.resolve({ riders: [], warning: "" }),
    selectedOrderId ? loadOrderDeliveryAssignment(selectedOrderId) : Promise.resolve(null),
  ]);

  const totalOrderPages = Math.max(1, Number(ordersData.totalPages || 1));
  const totalExceptionPages = Math.max(1, Number(exceptionData.totalPages || 1));
  const orderStart = ordersData.totalCount ? (ordersData.page - 1) * ordersData.pageSize + 1 : 0;
  const orderEnd = Math.min(ordersData.totalCount, ordersData.page * ordersData.pageSize);
  const warnings = Array.from(new Set([...(ordersData.warnings || []), ...(selectedDetail.warnings || []), ...(exceptionData.warnings || [])]));

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Orders Management</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          List orders, inspect details, update order/payment/delivery statuses, and track customer support notes.
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
        <strong>Returns, refunds, and replacements have a dedicated workflow.</strong>{" "}
        <Link href="/admin/orders/support" style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}>
          Open Order Support Cases
        </Link>
      </section>

      {warnings.length ? (
        <section style={{ marginBottom: 12, background: "#f8fafc", border: "1px solid #cbd5e1", color: "#334155", borderRadius: 8, padding: "10px 12px" }}>
          <strong>Order admin notes.</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", marginBottom: 18 }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
          <strong>Order List</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Search and filter all orders before opening a detail view.
          </p>
        </div>

        <form
          method="GET"
          style={{ padding: 12, borderBottom: "1px solid #e2e8f0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        >
          <PreservedParams params={params} exclude={["q", "page", "pageSize", "status", "paymentStatus", "deliveryStatus", "orderId"]} />
          <input type="hidden" name="page" value="1" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search order id, customer, promo, or status"
            style={{ minWidth: 260, flex: "1 1 320px", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
          />
          <select name="status" defaultValue={status} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            {ORDER_STATUS_FILTERS.map((option) => <option key={option} value={option}>{option === "all" ? "All order statuses" : textStatus(option)}</option>)}
          </select>
          <select name="paymentStatus" defaultValue={paymentStatus} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            {PAYMENT_STATUS_FILTERS.map((option) => <option key={option} value={option}>{option === "all" ? "All payment statuses" : textStatus(option)}</option>)}
          </select>
          <select name="deliveryStatus" defaultValue={deliveryStatus} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            {DELIVERY_STATUS_FILTERS.map((option) => <option key={option} value={option}>{option === "all" ? "All delivery statuses" : textStatus(option)}</option>)}
          </select>
          <select name="pageSize" defaultValue={String(listPageSize)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>
            <option value="20">20 rows</option>
            <option value="50">50 rows</option>
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
          Showing {ordersData.totalCount ? `${orderStart}-${orderEnd}` : "0"} of {ordersData.totalCount} orders.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Order</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Customer</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Amount</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Status</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Support</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ordersData.records.map((row) => (
                <tr key={`order-${row.id}`} style={{ borderBottom: "1px solid #f1f5f9", background: String(row.id) === selectedOrderId ? "#f8fafc" : "#ffffff" }}>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <strong>#{row.id}</strong>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>{adminFormatters.dateTime(row.createdAt)}</p>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>{row.customer}</td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <strong>{adminFormatters.currency(row.total)}</strong>
                    {row.deliveryFee != null ? <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Delivery: {adminFormatters.currency(row.deliveryFee)}</p> : null}
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <OrderStatusBlock row={row} />
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{adminFormatters.number(row.supportCaseCount)}</p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Open: {adminFormatters.number(row.openSupportCaseCount)}</p>
                  </td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>
                    <Link
                      href={buildHref(params, { orderId: row.id })}
                      style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}
                    >
                      View detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!ordersData.records.length ? <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No orders match the current filter.</p> : null}

        <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Pager params={params} pageKey="page" page={ordersData.page} totalPages={totalOrderPages} />
        </div>
      </section>

      {selectedOrderId ? (
        <section style={{ border: "1px solid #dbeafe", borderRadius: 12, background: "#ffffff", marginBottom: 18 }}>
          <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #dbeafe" }}>
            <strong>Order Detail #{selectedOrderId}</strong>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
              Items, delivery address, support notes, and status controls for this order.
            </p>
          </div>

          {selectedDetail.order ? (
            <div style={{ padding: 12, display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Customer</p>
                  <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{selectedDetail.order.customer}</p>
                </article>
                <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Total</p>
                  <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.currency(selectedDetail.order.total)}</p>
                </article>
                <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Created</p>
                  <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{adminFormatters.dateTime(selectedDetail.order.createdAt)}</p>
                </article>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <strong>Status Updates</strong>
                <AdminOrderStatusControl
                  orderId={selectedDetail.order.id}
                  currentStatus={selectedDetail.order.status}
                  currentPaymentStatus={selectedDetail.order.paymentStatus}
                  currentDeliveryStatus={selectedDetail.order.deliveryStatus}
                  paymentMethod={selectedDetail.order.paymentMethod}
                  paymentIsManual={selectedDetail.order.paymentIsManual}
                />
              </div>

              <AdminOrderRiderAssignment
                order={selectedDetail.order}
                riders={riderData.riders}
                assignment={deliveryAssignment}
              />

              <div style={{ display: "grid", gap: 8 }}>
                <strong>Payment Review</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Payment Status</p>
                    <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{textStatus(selectedDetail.order.paymentStatus)}</p>
                  </article>
                  <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Method / Reference</p>
                    <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{textStatus(selectedDetail.payment?.provider || selectedDetail.order.paymentMethod)}</p>
                    <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 12 }}>{selectedDetail.payment?.reference || selectedDetail.order.paymentReference || "No reference yet"}</p>
                  </article>
                  <article style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>Customer Submission</p>
                    <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{selectedDetail.payment?.submittedAt ? adminFormatters.dateTime(selectedDetail.payment.submittedAt) : "Not submitted"}</p>
                    {selectedDetail.payment?.payer ? <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 12 }}>{selectedDetail.payment.payer}</p> : null}
                  </article>
                  {selectedDetail.payment?.rejectionReason ? (
                    <article style={{ border: "1px solid #fecaca", borderRadius: 10, padding: "10px 12px", background: "#fff7f7" }}>
                      <p style={{ margin: 0, color: "#991b1b", fontSize: 12 }}>Rejection Reason</p>
                      <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{selectedDetail.payment.rejectionReason}</p>
                    </article>
                  ) : null}
                </div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <strong>Delivery Address</strong>
                <p style={{ margin: 0, color: "#334155", whiteSpace: "pre-wrap" }}>
                  {selectedDetail.order.deliveryAddress || "No delivery address recorded."}
                </p>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <strong>Status Timeline</strong>
                {selectedDetail.statusHistory?.length ? (
                  <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 7 }}>
                    {selectedDetail.statusHistory.map((entry) => (
                      <li key={String(entry.id)} style={{ color: "#334155", fontSize: 13 }}>
                        <strong>{textStatus(entry.toStatus)}</strong>
                        {entry.fromStatus ? ` (from ${textStatus(entry.fromStatus)})` : ""}
                        {entry.note ? ` — ${entry.note}` : ""}
                        {entry.changedAt ? <span style={{ color: "#64748b" }}> · {adminFormatters.dateTime(entry.changedAt)}</span> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p style={{ margin: 0, color: "#64748b" }}>No status events recorded yet.</p>
                )}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Item</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Qty</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Unit Price</th>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e2e8f0" }}>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDetail.items.map((item) => (
                      <tr key={String(item.id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: 10 }}>
                          <strong>{item.productName}</strong>
                          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                            Product ID: {item.productId || "-"}{item.variantId ? ` | Variant ID: ${item.variantId}` : ""}{item.unit ? ` | ${item.unit}` : ""}
                          </p>
                          {item.sizePreferenceLabel ? (
                            <p style={{ margin: "6px 0 0", color: "#0f172a", fontSize: 12 }}>
                              Fulfilment size preference: <strong>{item.sizePreferenceLabel}</strong>
                            </p>
                          ) : null}
                          {item.fulfillmentNote ? (
                            <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 12 }}>
                              Fulfilment note: {item.fulfillmentNote}
                            </p>
                          ) : null}
                          {item.sizePreferenceLabel ? (
                            <p style={{ margin: "6px 0 0", color: "#0f172a", fontSize: 12 }}>
                              Fulfilment size preference: <strong>{item.sizePreferenceLabel}</strong>
                            </p>
                          ) : null}
                          {item.fulfillmentNote ? (
                            <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 12 }}>
                              Fulfilment note: {item.fulfillmentNote}
                            </p>
                          ) : null}
                        </td>
                        <td style={{ padding: 10 }}>{adminFormatters.number(item.quantity)}</td>
                        <td style={{ padding: 10 }}>{adminFormatters.currency(item.unitPrice)}</td>
                        <td style={{ padding: 10 }}>{adminFormatters.currency(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!selectedDetail.items.length ? <p style={{ margin: 0, padding: 12, color: "#64748b" }}>No line items found for this order.</p> : null}
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <strong>Customer Support Notes</strong>
                {selectedDetail.supportCases.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {selectedDetail.supportCases.map((supportCase) => (
                      <article key={String(supportCase.id)} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <StatusPill value={supportCase.caseStatusLabel} />
                          <strong>{supportCase.caseTypeLabel}</strong>
                          <span style={{ color: "#64748b", fontSize: 12 }}>{adminFormatters.dateTime(supportCase.updatedAt || supportCase.requestedAt)}</span>
                        </div>
                        <p style={{ margin: "8px 0 0" }}>{supportCase.reason}</p>
                        {supportCase.adminNote ? <p style={{ margin: "6px 0 0", color: "#334155" }}>Admin: {supportCase.adminNote}</p> : null}
                        {supportCase.customerNote ? <p style={{ margin: "6px 0 0", color: "#64748b" }}>Customer: {supportCase.customerNote}</p> : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: "#64748b" }}>No support notes recorded for this order.</p>
                )}
                <AdminOrderSupportCaseControl orderId={selectedDetail.order.id} />
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, padding: 12, color: "#b91c1c" }}>Order not found.</p>
          )}
        </section>
      ) : null}

      <section style={{ border: "1px solid #fecaca", borderRadius: 12, background: "#ffffff", marginBottom: 18 }}>
        <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #fee2e2" }}>
          <strong>Order Exception Queue</strong>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Prioritise payment failures, stock conflicts, stale fulfilment, cancellation follow-up, and refund mismatches.
          </p>
        </div>

        <div style={{ padding: 12, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXCEPTION_OPTIONS.map((option) => {
              const active = option === exception;
              const count = getFilterCount(exceptionData, option);
              const tone = filterTone(option);
              return (
                <Link
                  key={option}
                  href={buildHref(params, { exception: option, exceptionPage: 1 })}
                  style={{
                    textDecoration: "none",
                    border: `1px solid ${active ? tone.fg : tone.border}`,
                    background: active ? tone.bg : "#ffffff",
                    color: active ? tone.fg : "#0f172a",
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontSize: 13,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{textStatus(option)}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 20, padding: "0 6px", borderRadius: 999, background: active ? "#ffffff" : tone.bg, color: tone.fg, fontSize: 12, fontWeight: 700 }}>
                    {adminFormatters.number(count)}
                  </span>
                </Link>
              );
            })}
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
                  <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #fee2e2" }}>Update</th>
                </tr>
              </thead>
              <tbody>
                {exceptionData.records.map((row) => {
                  const issueTone = issueAgeTone(row.issueAgeHours);
                  const issueAgeLabel = row.issueAgeLabel || "-";
                  return (
                    <tr key={`exception-${row.id}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: 10 }}>
                        <strong>#{row.id}</strong>
                        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>{adminFormatters.currency(row.total)}</p>
                      </td>
                      <td style={{ padding: 10 }}>{row.customer}</td>
                      <td style={{ padding: 10 }}>
                        <span style={{ background: issueTone.bg, color: issueTone.fg, borderRadius: 999, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>
                          {issueTone.label}
                        </span>
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
                      <td style={{ padding: 10 }}>
                        <AdminOrderStatusControl
                          orderId={row.id}
                          currentStatus={row.status}
                          currentPaymentStatus={row.paymentStatus}
                          currentDeliveryStatus={row.deliveryStatus}
                          paymentMethod={row.paymentMethod}
                          paymentIsManual={row.paymentIsManual}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!exceptionData.records.length ? <p style={{ margin: 0, color: "#64748b" }}>No orders match the current exception filter.</p> : null}

          <Pager params={params} pageKey="exceptionPage" page={exceptionPage} totalPages={totalExceptionPages} label="Queue page" />
        </div>
      </section>
    </main>
  );
}
