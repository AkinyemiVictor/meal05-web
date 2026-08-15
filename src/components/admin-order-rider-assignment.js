"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const READY_STATUSES = new Set(["ready_for_dispatch", "awaiting_dispatch", "awaiting dispatch"]);

const label = (value) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AdminOrderRiderAssignment({ order, riders = [], assignment = null }) {
  const router = useRouter();
  const [riderId, setRiderId] = useState("");
  const [packageCount, setPackageCount] = useState(1);
  const [pickupLocation, setPickupLocation] = useState("Meal05 dispatch point");
  const [agreedPayment, setAgreedPayment] = useState("");
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedRider = useMemo(() => riders.find((rider) => rider.id === riderId), [riderId, riders]);
  const ready = READY_STATUSES.has(String(order?.deliveryStatus || "").trim().toLowerCase());

  const assign = async (event) => {
    event.preventDefault();
    setMessage("");
    setResult(null);
    try {
      const response = await fetch("/api/delivery/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [order.id],
          deliveryPartnerId: riderId,
          vehicleType: selectedRider?.vehicleType || "motorcycle",
          pickupLocation,
          agreedPartnerPayment: agreedPayment || null,
          otherDeliveryCost: null,
          notes: `Single-order assignment from Admin Orders for order #${order.id}`,
          packages: [{ orderId: order.id, packageCount: Number(packageCount) }],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload?.error || "Unable to assign this rider.");
        return;
      }
      setResult(payload);
      setMessage(`Assigned ${selectedRider?.fullName || "rider"} to route ${payload.route?.route_code || ""}.`);
      startTransition(() => router.refresh());
    } catch {
      setMessage("Network error. Please try again.");
    }
  };

  const current = assignment || (result?.route ? {
    routeId: result.route.id,
    routeCode: result.route.route_code,
    routeStatus: result.route.status,
    packageCount,
    rider: selectedRider,
  } : null);
  const riderMessage = result?.assignment?.secureLink
    ? `Meal05 has assigned you route ${result.assignment.routeCode}.\nPickup: ${pickupLocation}\nOpen your route: ${result.assignment.secureLink}\nPIN: ${result.assignment.pin}`
    : "";

  return (
    <section className="assignment-card">
      <div className="assignment-header">
        <div>
          <strong>Rider assignment</strong>
          <p>Choose a saved rider. Their contact card appears to the customer only when the delivery starts.</p>
        </div>
        <a href="/admin/riders">Manage riders</a>
      </div>

      {current ? (
        <div className="assignment-current">
          <div>
            <span>Assigned rider</span>
            <strong>{current.rider?.fullName || "Meal05 rider"}</strong>
            <small>{current.rider?.riderCode || ""}{current.rider?.phone ? ` · ${current.rider.phone}` : ""}</small>
          </div>
          <div>
            <span>Route</span>
            <strong>{current.routeCode || "Created"}</strong>
            <small>{label(current.routeStatus)} · {current.packageCount || packageCount} package(s)</small>
          </div>
          {current.routeId ? <a className="assignment-print" href={`/admin/delivery/routes/${current.routeId}/manifest`} target="_blank" rel="noreferrer">Print delivery sheet</a> : null}
        </div>
      ) : (
        <form className="assignment-form" onSubmit={assign}>
          <label>
            <span>Rider</span>
            <select required value={riderId} onChange={(event) => setRiderId(event.target.value)}>
              <option value="">Select rider</option>
              {riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.fullName} · {rider.riderCode}{rider.vehicleNumber ? ` · ${rider.vehicleNumber}` : ""}</option>)}
            </select>
          </label>
          <label>
            <span>Number of packages</span>
            <input required min="1" max="50" type="number" value={packageCount} onChange={(event) => setPackageCount(event.target.value)} />
          </label>
          <label>
            <span>Pickup point</span>
            <input required maxLength={300} value={pickupLocation} onChange={(event) => setPickupLocation(event.target.value)} />
          </label>
          <label>
            <span>Agreed rider payment (optional)</span>
            <input min="0" inputMode="decimal" type="number" value={agreedPayment} onChange={(event) => setAgreedPayment(event.target.value)} placeholder="₦0" />
          </label>
          <button disabled={isPending || !ready || !riderId || !riders.length} type="submit">
            {isPending ? "Assigning..." : "Assign rider"}
          </button>
          {!ready ? <p className="assignment-help">Set the delivery status to Ready for Dispatch before assigning a rider.</p> : null}
          {!riders.length ? <p className="assignment-help">Add an active rider first.</p> : null}
        </form>
      )}

      {riderMessage ? (
        <div className="assignment-share">
          <strong>Send to rider</strong>
          <p>The secure route link and PIN are for the assigned rider only.</p>
          <a href={`https://wa.me/?text=${encodeURIComponent(riderMessage)}`} target="_blank" rel="noreferrer">Open rider message in WhatsApp</a>
        </div>
      ) : null}
      {result?.customerOtpMessages?.[0] ? (
        <div className="assignment-otp">
          <strong>Customer delivery code: {result.customerOtpMessages[0].otp}</strong>
          <p>{result.customerOtpMessages[0].message}</p>
        </div>
      ) : null}
      {message ? <p className={result ? "assignment-success" : "assignment-error"} role="status">{message}</p> : null}

      <style jsx>{`
        .assignment-card { border: 1px solid #fed7aa; border-radius: 12px; background: #fffaf7; padding: 14px; display: grid; gap: 12px; }
        .assignment-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .assignment-header p { margin: 4px 0 0; color: #64748b; font-size: 13px; }
        .assignment-header a { color: #c2410c; font-size: 13px; font-weight: 800; white-space: nowrap; }
        .assignment-form { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
        label { display: grid; gap: 5px; color: #334155; font-size: 12px; font-weight: 800; }
        input, select { min-height: 42px; width: 100%; border: 1px solid #cbd5e1; border-radius: 9px; background: #fff; padding: 8px 10px; color: #0f172a; font: inherit; }
        button, .assignment-print, .assignment-share a { min-height: 42px; border: 1px solid #f04e1f; border-radius: 9px; background: #f04e1f; color: #fff; padding: 9px 12px; font-weight: 850; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        button { align-self: end; }
        button:disabled { opacity: .5; cursor: not-allowed; }
        .assignment-help { margin: 0; color: #9a3412; font-size: 12px; align-self: center; }
        .assignment-current { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)) auto; gap: 10px; align-items: stretch; }
        .assignment-current > div { display: grid; gap: 3px; border: 1px solid #fed7aa; border-radius: 10px; background: #fff; padding: 10px; }
        .assignment-current span, .assignment-current small { color: #64748b; font-size: 12px; }
        .assignment-current strong { color: #0f172a; }
        .assignment-share, .assignment-otp { border: 1px solid #bfdbfe; border-radius: 10px; background: #eff6ff; padding: 10px; display: grid; gap: 6px; }
        .assignment-share p, .assignment-otp p { margin: 0; color: #475569; font-size: 12px; }
        .assignment-share a { justify-self: start; min-height: 36px; border-color: #166534; background: #166534; font-size: 12px; }
        .assignment-success, .assignment-error { margin: 0; font-weight: 800; font-size: 13px; }
        .assignment-success { color: #166534; } .assignment-error { color: #b91c1c; }
        @media (max-width: 700px) { .assignment-header { display: grid; } .assignment-form, .assignment-current { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  );
}
