"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SIZE_PREFERENCE_LABELS } from "@/lib/commerce-options";
import { persistPendingCheckoutPayment } from "@/lib/checkout";
import styles from "../availability.module.css";

const money = (value) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value) || 0);

export default function AvailabilityRequestDetailClient({ requestId }) {
  const [record, setRecord] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/availability-requests/${requestId}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to load request");
    setRecord(payload.request);
  }, [requestId]);
  useEffect(() => { load().catch((loadError) => setError(loadError.message)); }, [load]);
  const act = async (action, extra = {}) => {
    setBusy(action); setError("");
    try {
      const response = await fetch(`/api/availability-requests/${requestId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to update request");
      if (action === "return_to_cart") { window.location.href = "/cart"; return; }
      if (action === "convert" && payload.orderId) {
        persistPendingCheckoutPayment({
          existingOrderId: payload.orderId,
          orderIdempotencyKey: `availability-order-${payload.orderId}`,
          form: { fullName: record?.customer_name || "Meal05 customer" },
          summary: { total: Number(record?.final_total ?? record?.submitted_total ?? 0) },
        });
        window.location.href = `/checkout/payment/moniepoint_transfer?orderId=${encodeURIComponent(payload.orderId)}`;
        return;
      }
      await load();
    } catch (actionError) { setError(actionError.message); } finally { setBusy(""); }
  };
  return <main className={styles.page}><div className={styles.shell}>
    <Link className={styles.back} href="/account/availability-requests">← Availability requests</Link>
    <section className={styles.card}>
      {!record ? <p>{error || "Loading…"}</p> : <>
        <div className={styles.rowHead}><div><h1>{record.request_number}</h1><p className={styles.muted}>Submitted {new Date(record.created_at).toLocaleString()}</p></div><span className={styles.badge}>{record.status.replaceAll("_", " ")}</span></div>
        {record.status === "confirmed" ? <div className={styles.notice}><strong>Confirmed — ready for payment.</strong><br />Create the order before {new Date(record.payment_expires_at).toLocaleString()}. Delivery scheduling starts 24 hours after verified payment.</div> : null}
        {record.status === "action_required" ? <div className={styles.notice}>One or more items are unavailable. Remove them to continue with the rest of the basket.</div> : null}
        <div className={styles.items}>{(record.items || []).filter((item) => !item.customer_removed_at).map((item) => <div className={styles.item} key={item.id}>
          <div className={styles.rowHead}><strong>{item.product_name} {item.variant_name ? `— ${item.variant_name}` : ""}</strong><span className={styles.badge}>{item.resolution_status.replaceAll("_", " ")}</span></div>
          <p>{item.quantity} {item.unit || "unit"} · {money(item.confirmed_unit_price ?? item.submitted_unit_price)} each</p>
          {item.size_preference ? <p>Preference: {SIZE_PREFERENCE_LABELS[item.size_preference]}</p> : null}
          {item.admin_note ? <p className={styles.muted}>{item.admin_note}</p> : null}
          {item.resolution_status === "unavailable" ? <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => act("remove_unavailable_item", { itemId: item.id })}>Remove item and continue</button> : null}
        </div>)}</div>
        <p><strong>Total:</strong> {money(record.final_total ?? record.submitted_total)}</p>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.actions}>
          {record.status === "confirmed" ? <button className={styles.button} disabled={Boolean(busy)} onClick={() => act("convert")}>{busy === "convert" ? "Creating order…" : "Create order for payment"}</button> : null}
          {["cancelled", "expired", "action_required"].includes(record.status) ? <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => act("return_to_cart")}>Return available items to cart</button> : null}
          {!["converted", "cancelled", "expired"].includes(record.status) ? <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => act("cancel")}>Cancel request</button> : null}
          {record.converted_order_id ? <Link className={styles.back} href="/account/orders">View order #{record.converted_order_id}</Link> : null}
        </div>
      </>}
    </section>
  </div></main>;
}
