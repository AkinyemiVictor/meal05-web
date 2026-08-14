import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import PaymentActions from "./payment-actions";

export const dynamic = "force-dynamic";

const money = (value) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value) || 0);

const text = (value) => String(value || "unknown").replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());

const purposeLabel = (value) => {
  if (value === "wallet_topup") return "Wallet deposit";
  if (value === "order_payment") return "Checkout payment";
  return text(value);
};

export default async function AdminPaymentsPage({ searchParams }) {
  const params = await searchParams;
  const status = params?.status && params.status !== "all" ? String(params.status) : "";
  const purpose = params?.purpose && params.purpose !== "all" ? String(params.purpose) : "";
  let query = getSupabaseAdminClient()
    .from("payments")
    .select("id, reference, user_id, order_id, wallet_topup_id, purpose, provider_code, amount, currency, status, payer_account_name, payer_bank_name, customer_transaction_reference, customer_submitted_at, verified_at, rejected_at, rejection_reason, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);
  if (purpose) query = query.eq("purpose", purpose);
  const { data, error } = await query;
  const rows = Array.isArray(data) ? data : [];

  return (
    <main style={{ padding: 24, display: "grid", gap: 18 }}>
      <header>
        <p style={{ margin: 0, color: "#f04e1f", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase" }}>Finance</p>
        <h1 style={{ margin: "4px 0", fontSize: 32 }}>Payments</h1>
        <p style={{ margin: 0, color: "#64748b" }}>Verify Moniepoint transfers before orders become paid or wallet deposits are credited.</p>
      </header>

      {error ? <p style={{ color: "#b91c1c", fontWeight: 700 }}>{error.message}</p> : null}

      <section style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left" }}>
              {["Reference", "Purpose", "Status", "Amount", "Provider", "Order", "Sender", "Submitted", "Actions"].map((heading) => (
                <th key={heading} style={{ padding: 12, fontSize: 13, color: "#475569" }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr><td colSpan={9} style={{ padding: 18, color: "#64748b" }}>No payments match this view.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ padding: 12, fontWeight: 800 }}>{row.reference}</td>
                <td style={{ padding: 12 }}>
                  <strong>{purposeLabel(row.purpose)}</strong>
                  {row.wallet_topup_id ? <small style={{ display: "block", marginTop: 3, color: "#64748b" }}>Deposit {row.wallet_topup_id}</small> : null}
                </td>
                <td style={{ padding: 12 }}>{text(row.status)}</td>
                <td style={{ padding: 12 }}>{money(row.amount)}</td>
                <td style={{ padding: 12 }}>{text(row.provider_code)}</td>
                <td style={{ padding: 12 }}>{row.order_id ? `Order #${row.order_id}` : row.wallet_topup_id ? "Wallet funding" : "-"}</td>
                <td style={{ padding: 12 }}>{row.payer_account_name || "-"}{row.payer_bank_name ? ` (${row.payer_bank_name})` : ""}</td>
                <td style={{ padding: 12 }}>{row.customer_submitted_at ? new Date(row.customer_submitted_at).toLocaleString() : "-"}</td>
                <td style={{ padding: 12 }}>
                  <PaymentActions paymentId={row.id} status={row.status} />
                  {row.order_id ? <a href={`/admin/orders?orderId=${row.order_id}`} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", color: "#0f172a", textDecoration: "none", fontWeight: 700 }}>Order</a> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
