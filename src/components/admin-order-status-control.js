"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const PAID = new Set(["confirmed", "paid"]);
const CLOSED = new Set(["completed", "cancelled"]);

const humanize = (value) =>
  String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function getStepIndex(status) {
  const value = String(status || "").toLowerCase();
  if (["completed", "delivered"].includes(value)) return 3;
  if (["dispatched", "shipped"].includes(value)) return 2;
  if (["processing", "ready_for_dispatch"].includes(value)) return 1;
  return 0;
}

function getNextAction({ status, paymentStatus, fulfillmentType }) {
  const order = String(status || "").toLowerCase();
  const payment = String(paymentStatus || "").toLowerCase();
  const pickup = String(fulfillmentType || "delivery").toLowerCase() === "pickup";

  if (order === "cancelled") return { kind: "done", title: "Order cancelled", help: "No fulfilment action is required." };
  if (order === "completed") return { kind: "done", title: "Order complete", help: "This order has finished its fulfilment journey." };
  if (!PAID.has(payment)) {
    return {
      kind: "payment",
      title: payment === "awaiting_confirmation" ? "Review payment evidence" : "Resolve payment first",
      help: "Payment decisions are handled in Payments before fulfilment can begin.",
    };
  }
  if (["pending", "confirmed", "stock_failed", "payment_failed"].includes(order)) {
    return { kind: "update", title: "Start processing", help: "Send this paid order to picking and packing.", patch: { status: "processing" } };
  }
  if (order === "processing") {
    return {
      kind: "update",
      title: pickup ? "Mark ready for collection" : "Mark ready for dispatch",
      help: pickup ? "The customer can collect after this is packed." : "Packing is complete and a rider can now be assigned.",
      patch: { status: "ready_for_dispatch", delivery_status: "awaiting dispatch" },
    };
  }
  if (order === "ready_for_dispatch") {
    return pickup
      ? { kind: "update", title: "Mark collected", help: "Confirm the customer has collected the order.", patch: { status: "completed", delivery_status: "completed" } }
      : { kind: "update", title: "Mark dispatched", help: "Confirm the order has left with the rider.", patch: { status: "dispatched", delivery_status: "dispatched" } };
  }
  if (order === "shipped") {
    return { kind: "update", title: "Mark dispatched", help: "Move this legacy shipped order into the current delivery flow.", patch: { status: "dispatched", delivery_status: "dispatched" } };
  }
  if (order === "dispatched") {
    return { kind: "update", title: "Mark delivered", help: "Confirm the customer received the order.", patch: { status: "delivered", delivery_status: "delivered" } };
  }
  if (order === "delivered") {
    return { kind: "update", title: "Complete order", help: "Close this delivered order.", patch: { status: "completed", delivery_status: "completed" } };
  }
  return { kind: "done", title: "No action available", help: "Review the order history for more context." };
}

export default function AdminOrderStatusControl({
  orderId,
  currentStatus,
  currentPaymentStatus,
  currentDeliveryStatus,
  fulfillmentType = "delivery",
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const action = useMemo(
    () => getNextAction({ status: currentStatus, paymentStatus: currentPaymentStatus, fulfillmentType }),
    [currentStatus, currentPaymentStatus, fulfillmentType]
  );
  const activeStep = getStepIndex(currentStatus);
  const steps = ["Received", "Preparing", fulfillmentType === "pickup" ? "Ready" : "On the way", "Complete"];

  const update = async (patch) => {
    setMessage("");
    try {
      const response = await fetch("/api/admin/orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, ...patch, note: note.trim() || undefined }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload?.error || "The order could not be updated.");
        return;
      }
      setMessage("Order updated.");
      startTransition(() => router.refresh());
    } catch {
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <section className="next-action-card">
      <div className="progress" aria-label="Order progress">
        {steps.map((step, index) => (
          <div className={index <= activeStep ? "step step-active" : "step"} key={step}>
            <span>{index < activeStep ? "✓" : index + 1}</span>
            <small>{step}</small>
          </div>
        ))}
      </div>

      <div className="action-copy">
        <p>Next action</p>
        <h2>{action.title}</h2>
        <span>{action.help}</span>
      </div>

      {action.kind === "payment" ? (
        <Link className="primary" href={`/admin/payments?purpose=order_payment&orderId=${encodeURIComponent(orderId)}`}>
          Open payment review
        </Link>
      ) : null}
      {action.kind === "update" ? (
        <button className="primary" type="button" disabled={isPending} onClick={() => update(action.patch)}>
          {isPending ? "Updating…" : action.title}
        </button>
      ) : null}

      {!CLOSED.has(String(currentStatus || "").toLowerCase()) ? (
        <details className="advanced">
          <summary>More actions</summary>
          <label>
            Internal note (optional)
            <textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Reason for this update" />
          </label>
          <div className="advanced-row">
            <button type="button" disabled={isPending} onClick={() => update({ status: "cancelled" })}>Cancel order</button>
            <Link href={`/admin/orders/support?orderId=${encodeURIComponent(orderId)}`}>Open support case</Link>
          </div>
        </details>
      ) : null}

      {message ? <p className={message === "Order updated." ? "success" : "error"} role="status">{message}</p> : null}

      <div className="state-line">
        <span>Order: <strong>{humanize(currentStatus)}</strong></span>
        <span>Payment: <strong>{humanize(currentPaymentStatus)}</strong></span>
        <span>Delivery: <strong>{humanize(currentDeliveryStatus || "Not started")}</strong></span>
      </div>

      <style jsx>{`
        .next-action-card { display:grid; gap:16px; border:1px solid #bbf7d0; border-radius:16px; background:linear-gradient(145deg,#f0fdf4,#fff); padding:18px; }
        .progress { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
        .step { position:relative; display:grid; justify-items:center; gap:5px; color:#94a3b8; font-weight:750; text-align:center; }
        .step:not(:last-child):after { content:""; position:absolute; top:13px; left:calc(50% + 16px); width:calc(100% - 32px); height:2px; background:#e2e8f0; }
        .step span { position:relative; z-index:1; display:grid; width:28px; height:28px; place-items:center; border-radius:50%; background:#e2e8f0; color:#64748b; font-size:12px; }
        .step small { font-size:11px; }
        .step-active { color:#166534; }.step-active span,.step-active:not(:last-child):after { background:#22c55e; color:white; }
        .action-copy p { margin:0 0 4px; color:#16a34a; font-size:11px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; }
        .action-copy h2 { margin:0; color:#0f172a; font-size:24px; }.action-copy span { display:block; margin-top:5px; color:#64748b; font-size:13px; line-height:1.5; }
        .primary { display:inline-flex; min-height:46px; align-items:center; justify-content:center; justify-self:start; border:0; border-radius:11px; background:#111827; padding:0 18px; color:white; font-weight:850; text-decoration:none; cursor:pointer; }
        .primary:disabled { opacity:.6; cursor:wait; }
        .advanced { border-top:1px solid #dcfce7; padding-top:12px; }.advanced summary { color:#475569; font-size:13px; font-weight:800; cursor:pointer; }
        .advanced label { display:grid; gap:6px; margin-top:12px; color:#475569; font-size:12px; font-weight:750; }.advanced textarea { min-height:70px; resize:vertical; border:1px solid #cbd5e1; border-radius:9px; padding:9px; font:inherit; }
        .advanced-row { display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; }.advanced-row button,.advanced-row a { display:inline-flex; min-height:38px; align-items:center; border:1px solid #cbd5e1; border-radius:9px; background:white; padding:0 12px; color:#334155; font-size:12px; font-weight:800; text-decoration:none; cursor:pointer; }.advanced-row button { border-color:#fecaca; color:#b91c1c; }
        .state-line { display:flex; gap:8px 16px; flex-wrap:wrap; border-top:1px solid #dcfce7; padding-top:12px; color:#64748b; font-size:11px; }.state-line strong { color:#334155; }
        .success,.error { margin:0; font-size:13px; font-weight:800; }.success{color:#166534}.error{color:#b91c1c}
        @media(max-width:520px){.progress{gap:3px}.step small{font-size:9px}.primary{width:100%}}
      `}</style>
    </section>
  );
}
