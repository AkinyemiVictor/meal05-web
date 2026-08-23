"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SIZE_PREFERENCE_LABELS } from "@/lib/commerce-options";
import { persistPendingCheckoutPayment } from "@/lib/checkout";
import {
  getAvailabilityItemPresentation,
  getAvailabilityRequestPresentation,
  isAvailabilityRequestLive,
} from "@/lib/availability-request-presenter";
import styles from "../availability.module.css";

const money = (value) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const formatDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "";
};

const getDeadlineCopy = (record, phase) => {
  if (phase === "awaiting_confirmation" && record?.confirmation_deadline_at) {
    return `Expected update by ${formatDateTime(record.confirmation_deadline_at)}.`;
  }
  if (phase === "confirmation_overdue") {
    return "The target confirmation time has passed. Your request remains active and no payment has been taken.";
  }
  if (phase === "ready_for_payment" && record?.payment_expires_at) {
    return `Complete payment before ${formatDateTime(record.payment_expires_at)}.`;
  }
  if (phase === "payment_expired" || phase === "expired") {
    return "The earlier availability confirmation can no longer be guaranteed.";
  }
  return "";
};

const toneClass = (base, tone) =>
  [styles[base], styles[`${base}_${tone}`]].filter(Boolean).join(" ");

export default function AvailabilityRequestDetailClient({ requestId }) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setError("");
    const response = await fetch(`/api/availability-requests/${requestId}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to load request");
    setRecord(payload.request);
    setLastUpdatedAt(new Date());
  }, [requestId]);

  useEffect(() => {
    load().catch((loadError) => setError(loadError.message));
  }, [load]);

  useEffect(() => {
    if (!record || !isAvailabilityRequestLive(record)) return undefined;

    const refresh = () => load({ silent: true }).catch(() => {});
    const timer = window.setInterval(refresh, 30000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load, record?.status]);

  const act = async (action, extra = {}) => {
    setBusy(action);
    setError("");
    try {
      const response = await fetch(`/api/availability-requests/${requestId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to update request");

      if (action === "return_to_cart") {
        window.location.href = "/cart";
        return;
      }

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
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy("");
    }
  };

  const presentation = record ? getAvailabilityRequestPresentation(record) : null;
  const deadlineCopy = record && presentation ? getDeadlineCopy(record, presentation.phase) : "";
  const activeItems = (record?.items || []).filter((item) => !item.customer_removed_at);
  const confirmedTotal = Number(record?.final_total ?? record?.submitted_total ?? 0);
  const totalLabel = ["ready_for_payment", "converted"].includes(presentation?.phase)
    ? "Confirmed total"
    : "Basket estimate";

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.back} href="/account/availability-requests">
          ← Availability requests
        </Link>

        <section className={styles.card}>
          {!record ? (
            <div className={styles.loadingState}>
              <strong>{error || "Loading request…"}</strong>
              {!error ? <span className={styles.muted}>Getting the latest availability update.</span> : null}
            </div>
          ) : (
            <>
              <div className={styles.rowHead}>
                <div>
                  <p className={styles.eyebrow}>Availability request</p>
                  <h1>{record.request_number}</h1>
                  <p className={styles.muted}>Submitted {formatDateTime(record.created_at)}</p>
                </div>
                <span className={toneClass("statusBadge", presentation.tone)}>{presentation.label}</span>
              </div>

              <div className={toneClass("statusPanel", presentation.tone)} role="status">
                <div>
                  <strong>{presentation.title}</strong>
                  <p>{presentation.description}</p>
                </div>
                {deadlineCopy ? <p className={styles.statusDeadline}>{deadlineCopy}</p> : null}
              </div>

              <div className={styles.progress} aria-label="Availability request progress">
                {presentation.progress.map((step, index) => (
                  <div key={step.key} className={toneClass("progressStep", step.state)}>
                    <span className={styles.progressMarker} aria-hidden="true">
                      {step.state === "complete" ? "✓" : index + 1}
                    </span>
                    <span>{step.label}</span>
                  </div>
                ))}
              </div>

              <div className={styles.requestMeta}>
                <div>
                  <span>Delivery address</span>
                  <strong>{record.delivery_address}</strong>
                </div>
                <div>
                  <span>Contact</span>
                  <strong>{record.customer_phone}</strong>
                </div>
              </div>

              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>Basket</p>
                  <h2>Item status</h2>
                </div>
                <span>{activeItems.length} item{activeItems.length === 1 ? "" : "s"}</span>
              </div>

              <div className={styles.items}>
                {activeItems.map((item) => {
                  const itemPresentation = getAvailabilityItemPresentation(item);
                  const itemPrice = item.confirmed_unit_price ?? item.submitted_unit_price;
                  return (
                    <div className={styles.item} key={item.id}>
                      <div className={styles.rowHead}>
                        <strong>
                          {item.product_name}
                          {item.variant_name ? ` — ${item.variant_name}` : ""}
                        </strong>
                        <span className={toneClass("itemBadge", itemPresentation.tone)}>
                          {itemPresentation.label}
                        </span>
                      </div>
                      <p className={styles.itemDetail}>{itemPresentation.detail}</p>
                      <p>
                        {item.quantity} {item.unit || "unit"} · {money(itemPrice)} each
                      </p>
                      {item.size_preference ? (
                        <p>Preferred size: {SIZE_PREFERENCE_LABELS[item.size_preference]}</p>
                      ) : null}
                      {item.admin_note ? <p className={styles.muted}>{item.admin_note}</p> : null}
                      {item.resolution_status === "unavailable" ? (
                        <button
                          className={styles.secondary}
                          disabled={Boolean(busy)}
                          onClick={() => act("remove_unavailable_item", { itemId: item.id })}
                        >
                          {busy === "remove_unavailable_item" ? "Removing…" : "Remove unavailable item"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className={styles.totalRow}>
                <span>{totalLabel}</span>
                <strong>{money(confirmedTotal)}</strong>
              </div>

              {error ? <p className={styles.error} role="alert">{error}</p> : null}

              <div className={styles.actions}>
                {presentation.phase === "ready_for_payment" ? (
                  <button
                    className={styles.button}
                    disabled={Boolean(busy)}
                    onClick={() => act("convert")}
                  >
                    {busy === "convert" ? "Preparing payment…" : "Continue to payment"}
                  </button>
                ) : null}

                {["cancelled", "expired", "action_required"].includes(record.status) ? (
                  <button
                    className={styles.secondary}
                    disabled={Boolean(busy)}
                    onClick={() => act("return_to_cart")}
                  >
                    {busy === "return_to_cart" ? "Returning items…" : "Return eligible items to cart"}
                  </button>
                ) : null}

                {!["converted", "cancelled", "expired"].includes(record.status) ? (
                  <button
                    className={styles.secondary}
                    disabled={Boolean(busy)}
                    onClick={() => act("cancel")}
                  >
                    {busy === "cancel" ? "Cancelling…" : "Cancel request"}
                  </button>
                ) : null}

                {record.converted_order_id ? (
                  <Link className={styles.inlineLink} href="/account/orders">
                    View order #{record.converted_order_id}
                  </Link>
                ) : null}
              </div>

              {lastUpdatedAt ? (
                <p className={styles.lastUpdated}>Status refreshed {lastUpdatedAt.toLocaleTimeString()}</p>
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
