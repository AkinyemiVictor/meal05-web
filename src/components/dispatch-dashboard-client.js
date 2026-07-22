"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const money = (value) =>
  new Intl.NumberFormat("en-NG", {
    currency: "NGN",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(Number(value) || 0);

const text = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

export default function DispatchDashboardClient({ orders = [], partners = [], routes = [], warnings = [] }) {
  const router = useRouter();
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [deliveryPartnerId, setDeliveryPartnerId] = useState("");
  const [vehicleType, setVehicleType] = useState("motorcycle");
  const [plannedStartTime, setPlannedStartTime] = useState("");
  const [pickupLocation, setPickupLocation] = useState("Meal05 dispatch point");
  const [agreedPartnerPayment, setAgreedPartnerPayment] = useState("");
  const [otherDeliveryCost, setOtherDeliveryCost] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [assignment, setAssignment] = useState(null);
  const [otpMessages, setOtpMessages] = useState([]);
  const [isPending, startTransition] = useTransition();

  const selectedOrderRows = useMemo(
    () => orders.filter((order) => selectedOrders.includes(String(order.id))),
    [orders, selectedOrders]
  );
  const feesCollected = selectedOrderRows.reduce((sum, order) => sum + (Number(order.delivery_fee) || 0), 0);
  const estimatedMargin = feesCollected - (Number(agreedPartnerPayment) || 0) - (Number(otherDeliveryCost) || 0);

  const toggleOrder = (id) => {
    const key = String(id);
    setSelectedOrders((current) => (current.includes(key) ? current.filter((value) => value !== key) : [...current, key]));
  };

  const createRoute = async (event) => {
    event.preventDefault();
    setMessage("");
    setAssignment(null);
    setOtpMessages([]);
    try {
      const response = await fetch("/api/delivery/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: selectedOrders,
          deliveryPartnerId: deliveryPartnerId || null,
          vehicleType,
          plannedStartTime: plannedStartTime || null,
          pickupLocation,
          agreedPartnerPayment: agreedPartnerPayment || null,
          otherDeliveryCost: otherDeliveryCost || null,
          notes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload?.error || "Unable to create route.");
        return;
      }
      setMessage(`Route ${payload.route?.route_code || ""} created.`);
      setOtpMessages(payload.customerOtpMessages || []);
      setSelectedOrders([]);
      setAssignment(payload.assignment || null);
      startTransition(() => router.refresh());
    } catch {
      setMessage("Network error. Try again.");
    }
  };

  const generateToken = async (routeId) => {
    setMessage("");
    try {
      const response = await fetch(`/api/delivery/tokens/${routeId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirePin: true, expiresInHours: 48 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload?.error || "Unable to generate rider link.");
        return;
      }
      setAssignment(payload);
    } catch {
      setMessage("Network error. Try again.");
    }
  };

  const assignmentMessage = assignment
    ? `Meal05 has assigned you route ${assignment.routeCode}.\nDeliveries: ${assignment.stopCount || selectedOrderRows.length || "See route"}\nPickup: ${pickupLocation || "Meal05 dispatch point"}\nPlanned start: ${plannedStartTime || "Confirm with dispatch"}\nAgreed payment: ${money(agreedPartnerPayment)}\nOpen your route:\n${assignment.secureLink}\nPIN:\n${assignment.pin}`
    : "";

  return (
    <div className="dispatch-grid">
      {warnings.length ? (
        <section className="dispatch-alert">
          <strong>Dispatch data warnings</strong>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="dispatch-panel">
        <div className="dispatch-panel__header">
          <div>
            <h2>Orders ready for dispatch</h2>
            <p>Select orders going to similar areas, then create a route.</p>
          </div>
          <strong>{selectedOrders.length} selected</strong>
        </div>
        <div className="dispatch-order-list">
          {orders.length ? orders.map((order) => (
            <label key={order.id} className="dispatch-order">
              <input type="checkbox" checked={selectedOrders.includes(String(order.id))} onChange={() => toggleOrder(order.id)} />
              <span>
                <strong>#{order.order_reference || order.id}</strong>
                <em>{order.delivery_contact_name || "Meal05 customer"} - {order.delivery_contact_phone || "No phone"}</em>
                <small>{order.delivery_address || order.delivery_landmark || "No address"}</small>
              </span>
              <b>{money(order.delivery_fee)}</b>
            </label>
          )) : (
            <p className="dispatch-empty">No orders are ready for dispatch.</p>
          )}
        </div>
      </section>

      <form className="dispatch-panel dispatch-form" onSubmit={createRoute}>
        <div className="dispatch-panel__header">
          <div>
            <h2>Create route</h2>
            <p>Assign partner, planned pickup and agreed payment.</p>
          </div>
        </div>
        <label>
          <span>Delivery partner</span>
          <select required value={deliveryPartnerId} onChange={(event) => setDeliveryPartnerId(event.target.value)}>
            <option value="">Select delivery partner</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.full_name || partner.name} {partner.vehicle_plate_number ? `- ${partner.vehicle_plate_number}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Vehicle type</span>
          <select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)}>
            <option value="motorcycle">Motorcycle</option>
            <option value="napep">Napep</option>
            <option value="korope">Korope</option>
            <option value="car">Car</option>
            <option value="van">Van</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          <span>Planned start</span>
          <input type="datetime-local" value={plannedStartTime} onChange={(event) => setPlannedStartTime(event.target.value)} />
        </label>
        <label>
          <span>Pickup point</span>
          <input value={pickupLocation} onChange={(event) => setPickupLocation(event.target.value)} />
        </label>
        <label>
          <span>Agreed rider payment</span>
          <input inputMode="decimal" type="number" value={agreedPartnerPayment} onChange={(event) => setAgreedPartnerPayment(event.target.value)} />
        </label>
        <label>
          <span>Other delivery cost</span>
          <input inputMode="decimal" type="number" value={otherDeliveryCost} onChange={(event) => setOtherDeliveryCost(event.target.value)} />
        </label>
        <label>
          <span>Internal notes</span>
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <div className="dispatch-metrics">
          <span>Fees collected <strong>{money(feesCollected)}</strong></span>
          <span>Estimated margin <strong>{money(estimatedMargin)}</strong></span>
        </div>
        <button disabled={isPending || !selectedOrders.length || !deliveryPartnerId} type="submit">
          {isPending ? "Creating..." : "Create route"}
        </button>
        {message ? <p className="dispatch-message">{message}</p> : null}
      </form>

      {assignment ? (
        <section className="dispatch-panel">
          <div className="dispatch-panel__header">
            <div>
              <h2>Secure rider link</h2>
              <p>Send this only to the assigned delivery partner. It expires automatically.</p>
            </div>
          </div>
          <label>
            <span>Assignment message</span>
            <textarea readOnly rows={8} value={assignmentMessage} />
          </label>
          <a className="dispatch-whatsapp" href={`https://wa.me/?text=${encodeURIComponent(assignmentMessage)}`} target="_blank" rel="noreferrer">
            Open WhatsApp message
          </a>
        </section>
      ) : null}

      {otpMessages.length ? (
        <section className="dispatch-panel">
          <div className="dispatch-panel__header">
            <div>
              <h2>Customer OTP messages</h2>
              <p>Send each OTP only to the matching customer. Riders never see these codes.</p>
            </div>
          </div>
          <div className="dispatch-order-list">
            {otpMessages.map((entry) => (
              <article key={entry.orderId} className="dispatch-otp">
                <strong>Order #{entry.orderReference}</strong>
                <code>{entry.otp}</code>
                <p>{entry.message}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="dispatch-panel dispatch-routes">
        <div className="dispatch-panel__header">
          <div>
            <h2>Active route monitoring</h2>
            <p>Recent routes, route payment, fees collected and margin.</p>
          </div>
        </div>
        <div className="dispatch-route-list">
          {routes.map((route) => (
            <article key={route.id} className="dispatch-route">
              <span>{route.route_code}</span>
              <strong>{text(route.status)}</strong>
              <em>{route.delivery_partners?.full_name || route.delivery_partners?.name || "No rider assigned"}</em>
              <small>Fees {money(route.delivery_fees_collected)} - Payment {money(route.agreed_partner_payment)} - Margin {money(route.delivery_margin)}</small>
              {route.delivery_partner_id || route.delivery_partners ? (
                <button type="button" onClick={() => generateToken(route.id)}>Generate new rider link</button>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <style jsx>{`
        .dispatch-grid {
          display: grid;
          gap: 16px;
        }
        .dispatch-alert,
        .dispatch-panel {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #ffffff;
          padding: 14px;
        }
        .dispatch-alert {
          background: #fff7ed;
          color: #9a3412;
        }
        .dispatch-alert ul {
          margin: 6px 0 0 18px;
          padding: 0;
        }
        .dispatch-panel__header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        h2 {
          margin: 0;
          color: #0f172a;
          font-size: 18px;
        }
        p {
          margin: 4px 0 0;
          color: #64748b;
        }
        .dispatch-order-list,
        .dispatch-route-list {
          display: grid;
          gap: 10px;
        }
        .dispatch-order {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 10px;
          align-items: start;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px;
        }
        .dispatch-order span,
        .dispatch-route,
        .dispatch-otp {
          min-width: 0;
          display: grid;
          gap: 4px;
        }
        .dispatch-order em,
        .dispatch-route em,
        .dispatch-order small,
        .dispatch-route small {
          color: #64748b;
          font-style: normal;
        }
        .dispatch-form {
          display: grid;
          gap: 10px;
        }
        label {
          display: grid;
          gap: 5px;
          color: #334155;
          font-size: 13px;
          font-weight: 700;
        }
        input,
        select,
        textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 9px 10px;
          color: #0f172a;
          font: inherit;
        }
        button,
        .dispatch-whatsapp {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #0f172a;
          border-radius: 9px;
          background: #0f172a;
          color: #ffffff;
          padding: 9px 12px;
          font-weight: 800;
          text-decoration: none;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .dispatch-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 8px;
        }
        .dispatch-metrics span {
          border-radius: 10px;
          background: #f8fafc;
          padding: 10px;
          color: #64748b;
        }
        .dispatch-metrics strong {
          display: block;
          color: #0f172a;
        }
        .dispatch-message {
          color: #b91c1c;
          font-weight: 700;
        }
        .dispatch-otp code {
          width: fit-content;
          border-radius: 8px;
          background: #fff7ed;
          color: #c2410c;
          padding: 4px 8px;
          font-weight: 900;
        }
        .dispatch-route {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px;
        }
        .dispatch-route button {
          justify-self: start;
          min-height: 34px;
          font-size: 12px;
        }
        @media (min-width: 980px) {
          .dispatch-grid {
            grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.7fr);
            align-items: start;
          }
          .dispatch-alert,
          .dispatch-routes {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </div>
  );
}
