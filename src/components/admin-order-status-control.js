"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const ORDER_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "completed", label: "Completed" },
  { value: "stock_failed", label: "Stock Failed" },
  { value: "cancelled", label: "Cancelled" },
];
const ORDER_STATUS_VALUES = new Set(ORDER_STATUS_OPTIONS.map((option) => option.value));

const ORDER_STATUS_TRANSITIONS = {
  pending: new Set(["pending", "processing", "completed", "cancelled"]),
  processing: new Set(["processing", "shipped", "completed", "cancelled"]),
  shipped: new Set(["shipped", "delivered", "completed"]),
  delivered: new Set(["delivered", "completed"]),
  completed: new Set(["completed"]),
  cancelled: new Set(["cancelled"]),
  stock_failed: new Set(["stock_failed", "processing", "cancelled"]),
};

const PAYMENT_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
  { value: "unpaid", label: "Unpaid" },
];
const PAYMENT_STATUS_VALUES = new Set(PAYMENT_STATUS_OPTIONS.map((option) => option.value));

const PAYMENT_STATUS_TRANSITIONS = {
  pending: new Set(["pending", "processing", "paid", "failed", "unpaid"]),
  processing: new Set(["processing", "paid", "failed"]),
  unpaid: new Set(["unpaid", "pending", "processing", "paid", "failed"]),
  failed: new Set(["failed", "pending", "processing", "paid"]),
  paid: new Set(["paid", "refunded"]),
  refunded: new Set(["refunded"]),
};

const DELIVERY_STATUS_OPTIONS = [
  { value: "awaiting dispatch", label: "Awaiting Dispatch" },
  { value: "dispatched", label: "Dispatched" },
  { value: "in transit", label: "In Transit" },
  { value: "delayed", label: "Delayed" },
  { value: "delivered", label: "Delivered" },
  { value: "completed", label: "Completed" },
  { value: "returned", label: "Returned" },
];
const DELIVERY_STATUS_VALUES = new Set(DELIVERY_STATUS_OPTIONS.map((option) => option.value));

const DELIVERY_STATUS_TRANSITIONS = {
  "awaiting dispatch": new Set(["awaiting dispatch", "dispatched", "delayed", "completed", "returned"]),
  dispatched: new Set(["dispatched", "in transit", "delivered", "completed", "delayed", "returned"]),
  "in transit": new Set(["in transit", "delivered", "completed", "delayed", "returned"]),
  delayed: new Set(["delayed", "dispatched", "in transit", "delivered", "completed", "returned"]),
  delivered: new Set(["delivered", "completed"]),
  completed: new Set(["completed"]),
  returned: new Set(["returned"]),
};

export default function AdminOrderStatusControl({
  orderId,
  currentStatus,
  currentPaymentStatus,
  currentDeliveryStatus = "",
  paymentMethod = "",
  paymentIsManual = null,
}) {
  const router = useRouter();
  const normalizedCurrentStatus = String(currentStatus || "").toLowerCase();
  const normalizedCurrentPaymentStatus = String(currentPaymentStatus || "").toLowerCase();
  const normalizedCurrentDeliveryStatus = String(currentDeliveryStatus || "").toLowerCase();
  const allowedOrderStatusValues = ORDER_STATUS_TRANSITIONS[normalizedCurrentStatus] || null;
  const allowedPaymentStatusValues = PAYMENT_STATUS_TRANSITIONS[normalizedCurrentPaymentStatus] || null;
  const allowedDeliveryStatusValues = DELIVERY_STATUS_TRANSITIONS[normalizedCurrentDeliveryStatus] || null;
  const [status, setStatus] = useState(
    ORDER_STATUS_VALUES.has(normalizedCurrentStatus) ? normalizedCurrentStatus : ""
  );
  const [paymentStatus, setPaymentStatus] = useState(
    PAYMENT_STATUS_VALUES.has(normalizedCurrentPaymentStatus) ? normalizedCurrentPaymentStatus : ""
  );
  const [deliveryStatus, setDeliveryStatus] = useState(
    DELIVERY_STATUS_VALUES.has(normalizedCurrentDeliveryStatus) ? normalizedCurrentDeliveryStatus : ""
  );
  const normalizedPaymentMethod = String(paymentMethod || "").toLowerCase();
  const manualPaymentAllowed =
    paymentIsManual === true ||
    (paymentIsManual === null &&
      ["cash", "cash_on_delivery", "cash_on_pickup", "pos", "cod", "cop", "pay_on_delivery", "pay on delivery"].includes(
        normalizedPaymentMethod
      ));
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    const payload = { order_id: orderId };
    if (status && status !== normalizedCurrentStatus) {
      payload.status = status;
    }
    if (paymentStatus && paymentStatus !== normalizedCurrentPaymentStatus) {
      if (!manualPaymentAllowed) {
        setError("Payment status is locked for gateway payments.");
        return;
      }
      payload.payment_status = paymentStatus;
    }
    if (deliveryStatus && deliveryStatus !== normalizedCurrentDeliveryStatus) {
      payload.delivery_status = deliveryStatus;
    }
    if (!payload.status && !payload.payment_status && !payload.delivery_status) {
      setError("No change selected.");
      return;
    }

    try {
      const response = await fetch("/api/admin/orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || `Request failed (${response.status})`);
        return;
      }
      setOk("Updated");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error. Try again.");
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        disabled={isPending}
        aria-label="Order status"
        style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px", fontSize: 12 }}
      >
        <option value="">No change</option>
        {ORDER_STATUS_OPTIONS.filter((option) => {
          if (!allowedOrderStatusValues) return true;
          return allowedOrderStatusValues.has(option.value);
        }).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {manualPaymentAllowed ? (
        <select
          value={paymentStatus}
          onChange={(event) => setPaymentStatus(event.target.value)}
          disabled={isPending}
          aria-label="Payment status"
          style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px", fontSize: 12 }}
        >
          <option value="">No change</option>
          {PAYMENT_STATUS_OPTIONS.filter((option) => {
            if (!allowedPaymentStatusValues) return true;
            return allowedPaymentStatusValues.has(option.value);
          }).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <span
          style={{
            display: "inline-block",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 12,
            color: "#94a3b8",
            background: "#f8fafc",
          }}
          title="Payment status is controlled by the payment gateway"
        >
          {normalizedCurrentPaymentStatus || "unknown"} (gateway)
        </span>
      )}

      <select
        value={deliveryStatus}
        onChange={(event) => setDeliveryStatus(event.target.value)}
        disabled={isPending}
        aria-label="Delivery status"
        style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px", fontSize: 12 }}
      >
        <option value="">No change</option>
        {DELIVERY_STATUS_OPTIONS.filter((option) => {
          if (!allowedDeliveryStatusValues) return true;
          return allowedDeliveryStatusValues.has(option.value);
        }).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={isPending}
        style={{
          border: "1px solid #0f172a",
          borderRadius: 6,
          background: "#0f172a",
          color: "#ffffff",
          padding: "4px 8px",
          fontSize: 12,
          fontWeight: 600,
          cursor: isPending ? "not-allowed" : "pointer",
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? "Saving..." : "Update"}
      </button>

      {error ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
      {!error && ok ? <span style={{ color: "#166534", fontSize: 12 }}>{ok}</span> : null}
    </form>
  );
}
