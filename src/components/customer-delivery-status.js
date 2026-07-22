"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { key: "assigned_to_delivery_partner", label: "Order assigned" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "rider_approaching", label: "Rider approaching" },
  { key: "arrived", label: "Arrived" },
  { key: "delivered", label: "Delivered" },
];

const normalize = (value) => String(value || "").trim().toLowerCase();

export default function CustomerDeliveryStatus({ orderId }) {
  const [state, setState] = useState({ status: "idle", data: null, error: "" });

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setState({ status: "loading", data: null, error: "" });
    fetch(`/api/customer/orders/${encodeURIComponent(orderId)}/delivery`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Unable to load delivery status.");
        return payload;
      })
      .then((payload) => {
        if (!cancelled) setState({ status: "ready", data: payload, error: "" });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", data: null, error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!orderId) return null;
  if (state.status === "loading") return <section className="delivery-status-card">Loading delivery status...</section>;
  if (state.status === "error") return <section className="delivery-status-card">{state.error}</section>;
  if (!state.data?.order) return null;

  const deliveryStatus = normalize(state.data.order.delivery_status);
  const routeStatus = normalize(state.data.delivery?.delivery_routes?.status);
  const stopStatus = normalize(state.data.delivery?.status);
  const partner = state.data.delivery?.delivery_routes?.delivery_partners;
  const currentIndex = Math.max(
    STEPS.findIndex((step) => step.key === deliveryStatus),
    stopStatus === "arrived" ? 3 : -1,
    deliveryStatus === "delivered" || stopStatus === "delivered" ? 4 : -1
  );

  return (
    <section className="delivery-status-card">
      <h3>Track Delivery</h3>
      <p className="delivery-warning">Your order and delivery fee have already been paid. Do not make any additional payment to the delivery partner.</p>
      <ol>
        {STEPS.map((step, index) => (
          <li key={step.key} className={index <= currentIndex ? "done" : ""}>
            <span />
            {step.label}
          </li>
        ))}
      </ol>
      {partner ? (
        <div className="delivery-partner">
          <strong>{String(partner.full_name || partner.name || "Meal05 rider").split(" ")[0]}</strong>
          <span>{partner.vehicle_type || "delivery partner"} {partner.vehicle_plate_number ? `- ${partner.vehicle_plate_number}` : ""}</span>
        </div>
      ) : null}
      <p>Route status: <strong>{routeStatus || "pending"}</strong></p>
      <style jsx>{`
        .delivery-status-card {
          display: grid;
          gap: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #ffffff;
          padding: 14px;
        }
        h3,
        p {
          margin: 0;
        }
        .delivery-warning {
          border-radius: 10px;
          background: #fff7ed;
          color: #9a3412;
          padding: 10px;
          font-weight: 800;
        }
        ol {
          display: grid;
          gap: 8px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        li {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-weight: 800;
        }
        li span {
          width: 14px;
          height: 14px;
          border-radius: 999px;
          border: 2px solid #cbd5e1;
        }
        li.done {
          color: #0f172a;
        }
        li.done span {
          border-color: #00ac11;
          background: #00ac11;
        }
        .delivery-partner {
          display: grid;
          gap: 2px;
          border-top: 1px solid #e2e8f0;
          padding-top: 10px;
        }
      `}</style>
    </section>
  );
}
