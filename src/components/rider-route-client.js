"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

const text = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const money = (value) =>
  new Intl.NumberFormat("en-NG", {
    currency: "NGN",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(Number(value) || 0);

const mapsUrl = (stop) => {
  const lat = Number(stop?.delivery_latitude);
  const lng = Number(stop?.delivery_longitude);
  const destination = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : encodeURIComponent(stop?.delivery_address || "");
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
};

const whatsAppUrl = (stop) => {
  const phone = String(stop?.customer_phone || "").replace(/\D/g, "");
  const reference = stop?.orders?.order_reference || stop?.order_id || "your Meal05 order";
  const message = encodeURIComponent(
    `Hello, I am the Meal05 delivery partner handling order ${reference}. I am currently heading toward your delivery location.`
  );
  return phone ? `https://wa.me/${phone}?text=${message}` : "";
};

const callUrl = (stop) => {
  const phone = String(stop?.customer_phone || "").replace(/[^\d+]/g, "");
  return phone ? `tel:${phone}` : "";
};

const MAX_PROOF_PHOTO_DIMENSION = 1280;
const TARGET_PROOF_PHOTO_BYTES = 800 * 1024;
const MAX_PROOF_PHOTO_BYTES = 1_200_000;
const MIN_PROOF_PHOTO_QUALITY = 0.58;

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read proof photo."));
    };
    image.src = url;
  });

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Unable to compress proof photo."))), type, quality);
  });

const compressProofPhoto = async (file) => {
  if (!file) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP proof photo.");
  }

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_PROOF_PHOTO_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  if (scale === 1 && file.size <= TARGET_PROOF_PHOTO_BYTES && file.type === "image/jpeg") return file;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);

  let quality = 0.82;
  let blob = await canvasToBlob(canvas, "image/jpeg", quality);
  while (blob.size > TARGET_PROOF_PHOTO_BYTES && quality > MIN_PROOF_PHOTO_QUALITY) {
    quality = Math.max(MIN_PROOF_PHOTO_QUALITY, quality - 0.08);
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
  }
  if (blob.size > MAX_PROOF_PHOTO_BYTES) throw new Error("Proof photo is still too large. Retake it closer to the package.");

  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "proof-photo"}.jpg`, {
    lastModified: Date.now(),
    type: "image/jpeg",
  });
};

export default function RiderRouteClient({ token }) {
  const [pin, setPin] = useState("");
  const [route, setRoute] = useState(null);
  const [requiresPin, setRequiresPin] = useState(false);
  const [message, setMessage] = useState("");
  const [otp, setOtp] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientType, setRecipientType] = useState("customer");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [failureReason, setFailureReason] = useState("customer_unavailable");
  const [proofFile, setProofFile] = useState(null);
  const [isPending, startTransition] = useTransition();

  const stops = useMemo(() => (Array.isArray(route?.delivery_route_stops) ? route.delivery_route_stops : []), [route]);
  const activeStop = useMemo(
    () => stops.find((stop) => ["next", "en_route", "arrived"].includes(stop.status)) || stops.find((stop) => !["delivered", "failed", "returned", "skipped"].includes(stop.status)) || null,
    [stops]
  );
  const completedCount = stops.filter((stop) => stop.status === "delivered").length;

  const loadRoute = async () => {
    setMessage("");
    try {
      const response = await fetch(`/api/rider/routes/${encodeURIComponent(token)}${pin ? `?pin=${encodeURIComponent(pin)}` : ""}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload?.error || "Unable to load route.");
        return;
      }
      if (payload.requiresPin) {
        setRequiresPin(true);
        setRoute(null);
        return;
      }
      setRequiresPin(false);
      setRoute(payload.route);
      const next = (payload.route?.delivery_route_stops || []).find((stop) => ["next", "en_route", "arrived"].includes(stop.status));
      if (next?.customer_name) setRecipientName(next.customer_name);
    } catch {
      setMessage("Network error. Try again.");
    }
  };

  useEffect(() => {
    void loadRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const postAction = async (payload) => {
    setMessage("");
    try {
      const response = await fetch(`/api/rider/routes/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, ...payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data?.error || "Action failed.");
        return;
      }
      setMessage("Updated.");
      setOtp("");
      startTransition(() => {
        void loadRoute();
      });
    } catch {
      setMessage("Network error. Try again.");
    }
  };

  const uploadProofPhoto = async (stopId) => {
    if (!proofFile) {
      setMessage("Choose a proof photo first.");
      return;
    }
    setMessage("");
    const form = new FormData();
    form.set("pin", pin);
    form.set("stopId", stopId);
    form.set("file", proofFile);
    try {
      const response = await fetch(`/api/rider/routes/${encodeURIComponent(token)}/proof-photo`, {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data?.error || "Proof photo upload failed.");
        return;
      }
      setProofFile(null);
      setMessage("Proof photo uploaded.");
      startTransition(() => {
        void loadRoute();
      });
    } catch {
      setMessage("Network error. Try again.");
    }
  };

  const handleProofPhotoChange = async (file) => {
    setProofFile(null);
    if (!file) return;
    setMessage("Compressing proof photo...");
    try {
      const compressed = await compressProofPhoto(file);
      setProofFile(compressed);
      setMessage(`Proof photo ready (${Math.max(1, Math.round(compressed.size / 1024))} KB).`);
    } catch (error) {
      setMessage(error.message || "Unable to prepare proof photo.");
    }
  };

  return (
    <main className="rider-page">
      <section className="rider-card rider-hero">
        <p>Meal05 Rider</p>
        <h1>{route?.route_code || "Delivery route"}</h1>
        <span>{route ? `${completedCount}/${stops.length} deliveries complete` : "Secure route link"}</span>
      </section>

      {requiresPin ? (
        <section className="rider-card">
          <h2>Enter rider PIN</h2>
          <p>This link is protected. Enter the PIN sent by Meal05 dispatch.</p>
          <label>
            <span>PIN</span>
            <input inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} />
          </label>
          <button type="button" onClick={loadRoute} disabled={pin.length < 4}>Unlock route</button>
        </section>
      ) : null}

      {message ? <p className="rider-message">{message}</p> : null}

      {route ? (
        <>
          <section className="rider-card">
            <h2>Route summary</h2>
            <dl className="rider-summary">
              <div><dt>Status</dt><dd>{text(route.status)}</dd></div>
              <div><dt>Vehicle</dt><dd>{text(route.vehicle_type || route.delivery_partners?.vehicle_type)}</dd></div>
              <div><dt>Pickup</dt><dd>{route.pickup_location || "Confirm with dispatch"}</dd></div>
              <div><dt>Agreed payment</dt><dd>{money(route.agreed_partner_payment)}</dd></div>
            </dl>
            <div className="rider-actions">
              {route.status === "assigned" ? <button type="button" onClick={() => postAction({ action: "accept_route" })}>Accept Route</button> : null}
              {["accepted", "assigned"].includes(route.status) ? <button type="button" onClick={() => postAction({ action: "start_route" })}>Start Route</button> : null}
            </div>
          </section>

          {activeStop ? (
            <section className="rider-card stop-card">
              <p>Stop {activeStop.stop_number}</p>
              <h2>Order #{activeStop.orders?.order_reference || activeStop.order_id}</h2>
              <strong>{activeStop.customer_name?.split(" ")[0] || "Customer"}</strong>
              <span>{activeStop.customer_phone}</span>
              <address>{activeStop.delivery_address}</address>
              {activeStop.delivery_landmark ? <small>Landmark: {activeStop.delivery_landmark}</small> : null}
              {activeStop.delivery_notes ? <small>Notes: {activeStop.delivery_notes}</small> : null}

              <div className="rider-link-grid">
                <a href={mapsUrl(activeStop)} target="_blank" rel="noreferrer">Open Google Maps</a>
                {whatsAppUrl(activeStop) ? <a href={whatsAppUrl(activeStop)} target="_blank" rel="noreferrer">WhatsApp Customer</a> : null}
                {callUrl(activeStop) ? <a href={callUrl(activeStop)}>Call Customer</a> : null}
              </div>

              <div className="rider-actions">
                <button type="button" onClick={() => postAction({ action: "stop_status", stopId: activeStop.id, status: "en_route" })}>Mark En Route</button>
                <button type="button" onClick={() => postAction({ action: "stop_status", stopId: activeStop.id, status: "arrived" })}>I Have Arrived</button>
              </div>

              <div className="rider-form">
                <h3>Confirm delivery</h3>
                <label>
                  <span>OTP from customer</span>
                  <input inputMode="numeric" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))} />
                </label>
                <label>
                  <span>Recipient type</span>
                  <select value={recipientType} onChange={(event) => setRecipientType(event.target.value)}>
                    <option value="customer">Customer</option>
                    <option value="family_member">Family member</option>
                    <option value="security">Security</option>
                    <option value="staff">Staff</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  <span>Recipient name</span>
                  <input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
                </label>
                <label>
                  <span>Delivery notes</span>
                  <textarea rows={3} value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} />
                </label>
                <label>
                  <span>Optional proof photo</span>
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    type="file"
                    onChange={(event) => {
                      void handleProofPhotoChange(event.target.files?.[0] || null);
                    }}
                  />
                </label>
                <button type="button" disabled={!proofFile} onClick={() => uploadProofPhoto(activeStop.id)}>
                  Upload Proof Photo
                </button>
                <button
                  type="button"
                  disabled={isPending || otp.length < 4 || recipientName.trim().length < 2}
                  onClick={() => postAction({ action: "verify_otp", stopId: activeStop.id, otp, recipientType, recipientName, deliveryNotes })}
                >
                  Confirm Delivery
                </button>
              </div>

              <div className="rider-form rider-problem">
                <h3>Report a problem</h3>
                <label>
                  <span>Reason</span>
                  <select value={failureReason} onChange={(event) => setFailureReason(event.target.value)}>
                    <option value="customer_unavailable">Customer unavailable</option>
                    <option value="wrong_address">Wrong address</option>
                    <option value="customer_refused">Customer refused</option>
                    <option value="vehicle_issue">Vehicle issue</option>
                    <option value="package_damaged">Package damaged</option>
                    <option value="unsafe_location">Unsafe location</option>
                    <option value="unable_to_contact_customer">Unable to contact customer</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <button type="button" onClick={() => postAction({ action: "stop_status", stopId: activeStop.id, status: "failed", failureReason, notes: deliveryNotes })}>
                  Send Problem to Dispatch
                </button>
              </div>
            </section>
          ) : (
            <section className="rider-card">
              <h2>No active stops</h2>
              <p>All route stops are completed, failed, returned, or skipped.</p>
            </section>
          )}
        </>
      ) : null}

      <style jsx>{`
        .rider-page {
          min-height: 100vh;
          display: grid;
          align-content: start;
          gap: 12px;
          background: #f8fafc;
          padding: 14px;
          color: #0f172a;
        }
        .rider-card {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #ffffff;
          padding: 14px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
        }
        .rider-hero {
          background: #071426;
          color: #ffffff;
        }
        .rider-hero p,
        .stop-card p {
          margin: 0;
          color: #f04e1f;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        h1,
        h2,
        h3 {
          margin: 4px 0 8px;
        }
        .rider-summary {
          display: grid;
          gap: 8px;
          margin: 0;
        }
        .rider-summary div {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid #eef2f7;
          padding-bottom: 8px;
        }
        dt {
          color: #64748b;
          font-weight: 800;
        }
        dd {
          margin: 0;
          font-weight: 900;
          text-align: right;
        }
        .stop-card {
          display: grid;
          gap: 8px;
        }
        address {
          color: #0f172a;
          font-style: normal;
          font-size: 18px;
          font-weight: 900;
          line-height: 1.25;
        }
        small,
        span {
          color: #64748b;
          font-weight: 700;
        }
        .rider-actions,
        .rider-link-grid {
          display: grid;
          gap: 8px;
        }
        button,
        a {
          min-height: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #0f172a;
          border-radius: 10px;
          background: #0f172a;
          color: #ffffff;
          padding: 10px 12px;
          font: inherit;
          font-weight: 900;
          text-decoration: none;
        }
        .rider-link-grid a:nth-child(1) {
          background: #00ac11;
          border-color: #00ac11;
        }
        .rider-link-grid a:nth-child(2) {
          background: #f04e1f;
          border-color: #f04e1f;
        }
        button:disabled {
          opacity: 0.55;
        }
        .rider-form {
          display: grid;
          gap: 8px;
          border-top: 1px solid #eef2f7;
          margin-top: 8px;
          padding-top: 12px;
        }
        label {
          display: grid;
          gap: 5px;
          color: #334155;
          font-weight: 900;
        }
        input,
        select,
        textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 11px;
          font: inherit;
        }
        .rider-message {
          border-radius: 10px;
          background: #fff7ed;
          color: #9a3412;
          padding: 10px;
          font-weight: 900;
        }
        .rider-problem button {
          background: #991b1b;
          border-color: #991b1b;
        }
        @media (min-width: 760px) {
          .rider-page {
            max-width: 720px;
            margin: 0 auto;
          }
          .rider-link-grid,
          .rider-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
  );
}
