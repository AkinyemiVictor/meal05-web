import Link from "next/link";
import { adminFormatters, loadOrderExceptionQueue } from "@/lib/admin-dashboard-data";
import AdminOrderStatusControl from "@/components/admin-order-status-control";

export const dynamic = "force-dynamic";

const EXCEPTION_OPTIONS = ["all", "monitor", "at_risk", "overdue", "critical"];

const getFilterCount = (data, option) => {
  if (!data) return 0;
  if (option === "all") return Number(data.totalExceptions || 0);
  if (option === "critical") return Number(data.criticalCount || 0);
  if (option === "overdue") return Number(data.overdueCount || 0);
  if (option === "at_risk") return Number(data.atRiskCount || 0);
  if (option === "monitor") return Number(data.monitorCount || 0);
  return 0;
};

const buildHref = ({ exception, exceptionPage }) => {
  const params = new URLSearchParams();
  if (exception && exception !== "all") params.set("exception", exception);
  if (Number(exceptionPage) > 1) params.set("exceptionPage", String(exceptionPage));
  const query = params.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
};

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

const filterTone = (option) => {
  if (option === "critical") return { border: "#fecaca", bg: "#fee2e2", fg: "#991b1b" };
  if (option === "overdue") return { border: "#fed7aa", bg: "#ffedd5", fg: "#9a3412" };
  if (option === "at_risk") return { border: "#fde68a", bg: "#fef3c7", fg: "#854d0e" };
  if (option === "monitor") return { border: "#e2e8f0", bg: "#e5e7eb", fg: "#475569" };
  return { border: "#cbd5e1", bg: "#f8fafc", fg: "#0f172a" };
};

export default async function AdminOrdersPage({ searchParams }) {
  const params = (await searchParams) || {};
  const exception = EXCEPTION_OPTIONS.includes(String(params?.exception || "all")) ? String(params.exception || "all") : "all";
  const exceptionPage = Math.max(1, Number(params?.exceptionPage || 1));
  const exceptionData = await loadOrderExceptionQueue({ category: exception, page: exceptionPage, pageSize: 12 });
  const totalExceptionPages = Math.max(1, Number(exceptionData.totalPages || 1));

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px 40px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 6px" }}>Orders Management</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Track status, payment, and delivery flow for all orders.
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
        <strong>Returns, refunds, and replacements now have their own workflow.</strong>{" "}
        <Link href="/admin/orders/support" style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}>
          Open Order Support Cases
        </Link>
      </section>

      {exceptionData.warnings.length ? (
        <section style={{ marginBottom: 12, background: "#f8fafc", border: "1px solid #cbd5e1", color: "#334155", borderRadius: 8, padding: "10px 12px" }}>
          <strong>Exception queue notes.</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {exceptionData.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
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
                  href={buildHref({ exception: option, exceptionPage: 1 })}
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
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 22,
                      height: 20,
                      padding: "0 6px",
                      borderRadius: 999,
                      background: active ? "#ffffff" : tone.bg,
                      color: active ? tone.fg : tone.fg,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
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
                  const issueAgeHours = row.issueAgeHours;
                  const issueTone = issueAgeTone(issueAgeHours);
                  const issueAgeLabel = row.issueAgeLabel || "-";
                  return (
                    <tr key={`exception-${row.id}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
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

          {!exceptionData.records.length ? (
            <p style={{ margin: 0, color: "#64748b" }}>No orders match the current exception filter.</p>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href={buildHref({ exception, exceptionPage: Math.max(1, exceptionPage - 1) })}
              style={{
                pointerEvents: exceptionPage <= 1 ? "none" : "auto",
                opacity: exceptionPage <= 1 ? 0.5 : 1,
                textDecoration: "none",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "6px 10px",
                color: "#0f172a",
                background: "#ffffff",
              }}
            >
              Prev Queue Page
            </Link>
            <Link
              href={buildHref({ exception, exceptionPage: Math.min(totalExceptionPages, exceptionPage + 1) })}
              style={{
                pointerEvents: exceptionPage >= totalExceptionPages ? "none" : "auto",
                opacity: exceptionPage >= totalExceptionPages ? 0.5 : 1,
                textDecoration: "none",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "6px 10px",
                color: "#0f172a",
                background: "#ffffff",
              }}
            >
              Next Queue Page
            </Link>
          </div>
        </div>
      </section>

    </main>
  );
}
