"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const EMPTY = {
  id: "",
  fullName: "",
  phone: "",
  vehicleType: "motorcycle",
  vehicleNumber: "",
  operatingArea: "",
  isActive: true,
  photoUrl: "",
};

const vehicleLabel = (value) =>
  String(value || "Vehicle")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AdminRidersClient({ riders = [], warning = "" }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [photo, setPhoto] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const activeCount = useMemo(() => riders.filter((rider) => rider.isActive).length, [riders]);

  const edit = (rider) => {
    setForm({
      id: rider.id,
      fullName: rider.fullName,
      phone: rider.phone,
      vehicleType: rider.vehicleType || "motorcycle",
      vehicleNumber: rider.vehicleNumber || "",
      operatingArea: rider.operatingArea || "",
      isActive: rider.isActive,
      photoUrl: rider.photoUrl || "",
    });
    setPhoto(null);
    setRemovePhoto(false);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => {
    setForm(EMPTY);
    setPhoto(null);
    setRemovePhoto(false);
    setMessage("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    const data = new FormData();
    if (form.id) data.set("id", form.id);
    data.set("fullName", form.fullName);
    data.set("phone", form.phone);
    data.set("vehicleType", form.vehicleType);
    data.set("vehicleNumber", form.vehicleNumber);
    data.set("operatingArea", form.operatingArea);
    data.set("isActive", String(form.isActive));
    data.set("removePhoto", String(removePhoto));
    if (photo) data.set("photo", photo);

    try {
      const response = await fetch("/api/admin/riders/save", { method: "POST", body: data });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload?.error || "Unable to save the rider.");
        return;
      }
      setMessage(form.id ? "Rider details updated." : `Rider ${payload.rider?.rider_code || ""} added.`);
      setPhoto(null);
      setRemovePhoto(false);
      if (!form.id) setForm(EMPTY);
      startTransition(() => router.refresh());
    } catch {
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <div className="riders-grid">
      {warning ? <div className="riders-warning">Rider data warning: {warning}</div> : null}

      <section className="riders-panel riders-form-panel">
        <div className="riders-heading">
          <div>
            <span className="riders-eyebrow">Rider directory</span>
            <h1>{form.id ? "Edit rider" : "Add a rider"}</h1>
            <p>Add each rider once, then choose them when assigning an order.</p>
          </div>
          {form.id ? <button className="riders-secondary" type="button" onClick={reset}>Add another</button> : null}
        </div>

        <form className="riders-form" onSubmit={submit}>
          <label>
            <span>Rider name</span>
            <input required maxLength={120} value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="e.g. Samuel Adeyemi" />
          </label>
          <label>
            <span>Phone number</span>
            <input required inputMode="tel" maxLength={30} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="e.g. 0803 000 0000" />
          </label>
          <div className="riders-form-row">
            <label>
              <span>Vehicle type</span>
              <select value={form.vehicleType} onChange={(event) => setForm((current) => ({ ...current, vehicleType: event.target.value }))}>
                <option value="motorcycle">Motorcycle</option>
                <option value="napep">Napep</option>
                <option value="korope">Korope</option>
                <option value="car">Car</option>
                <option value="van">Van</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              <span>Vehicle number (optional)</span>
              <input maxLength={80} value={form.vehicleNumber} onChange={(event) => setForm((current) => ({ ...current, vehicleNumber: event.target.value }))} placeholder="e.g. ABC-123XY" />
            </label>
          </div>
          <label>
            <span>Usual delivery area (optional)</span>
            <input maxLength={160} value={form.operatingArea} onChange={(event) => setForm((current) => ({ ...current, operatingArea: event.target.value }))} placeholder="e.g. Kuje and Airport Road" />
          </label>
          <label>
            <span>Rider photo (optional)</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setPhoto(event.target.files?.[0] || null); setRemovePhoto(false); }} />
            <small>JPG, PNG or WebP, up to 1.5MB. Customers see it only during an active delivery.</small>
          </label>
          {form.photoUrl ? (
            <label className="riders-check">
              <input type="checkbox" checked={removePhoto} onChange={(event) => setRemovePhoto(event.target.checked)} />
              <span>Remove the current photo</span>
            </label>
          ) : null}
          <label className="riders-check riders-active">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
            <span>Active — available for new delivery assignments</span>
          </label>
          <button className="riders-primary" disabled={isPending} type="submit">
            {isPending ? "Saving..." : form.id ? "Save rider changes" : "Add rider"}
          </button>
          {message ? <p className="riders-message" role="status">{message}</p> : null}
        </form>
      </section>

      <section className="riders-panel riders-list-panel">
        <div className="riders-heading">
          <div>
            <span className="riders-eyebrow">{activeCount} active</span>
            <h2>Saved riders</h2>
            <p>Inactive riders stay in delivery history but cannot receive new orders.</p>
          </div>
        </div>
        <div className="riders-list">
          {riders.length ? riders.map((rider) => (
            <article className="rider-card" key={rider.id}>
              <div className="rider-avatar" role="img" aria-label={`${rider.fullName} profile photo`} style={rider.photoUrl ? { backgroundImage: `url(${rider.photoUrl})` } : undefined}>
                {!rider.photoUrl ? rider.fullName.slice(0, 1).toUpperCase() : null}
              </div>
              <div className="rider-card__body">
                <div className="rider-card__title">
                  <strong>{rider.fullName}</strong>
                  <span className={rider.isActive ? "is-active" : "is-inactive"}>{rider.isActive ? "Active" : "Inactive"}</span>
                </div>
                <p>{rider.riderCode || "Code pending"} · {rider.phone || "No phone"}</p>
                <small>{vehicleLabel(rider.vehicleType)}{rider.vehicleNumber ? ` · ${rider.vehicleNumber}` : ""}{rider.operatingArea ? ` · ${rider.operatingArea}` : ""}</small>
              </div>
              <button className="riders-secondary" type="button" onClick={() => edit(rider)}>Edit</button>
            </article>
          )) : <p className="riders-empty">No riders have been added yet.</p>}
        </div>
      </section>

      <style jsx>{`
        .riders-grid { max-width: 1160px; margin: 24px auto; padding: 0 16px 40px; display: grid; gap: 18px; }
        .riders-panel { border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; padding: 18px; box-shadow: 0 12px 32px rgba(15, 23, 42, .04); }
        .riders-warning { border: 1px solid #fed7aa; border-radius: 12px; background: #fff7ed; color: #9a3412; padding: 12px; }
        .riders-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .riders-heading h1, .riders-heading h2 { margin: 3px 0 5px; color: #0f172a; }
        .riders-heading h1 { font-size: 26px; } .riders-heading h2 { font-size: 21px; }
        .riders-heading p { margin: 0; color: #64748b; }
        .riders-eyebrow { color: #f04e1f; font-size: 12px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
        .riders-form { display: grid; gap: 13px; }
        .riders-form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        label { display: grid; gap: 6px; color: #334155; font-size: 13px; font-weight: 800; }
        input, select { width: 100%; min-height: 44px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px 11px; color: #0f172a; background: #fff; font: inherit; }
        input:focus, select:focus { border-color: #f04e1f; outline: 3px solid rgba(240,78,31,.12); }
        label small { color: #64748b; font-weight: 500; }
        .riders-check { grid-template-columns: auto 1fr; align-items: center; }
        .riders-check input { width: 18px; min-height: 18px; }
        .riders-active { border-radius: 10px; background: #f8fafc; padding: 11px; }
        .riders-primary, .riders-secondary { min-height: 42px; border-radius: 10px; padding: 9px 13px; font-weight: 900; cursor: pointer; }
        .riders-primary { border: 1px solid #f04e1f; background: #f04e1f; color: #fff; }
        .riders-primary:disabled { opacity: .6; cursor: wait; }
        .riders-secondary { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; }
        .riders-message { margin: 0; color: #166534; font-weight: 800; }
        .riders-list { display: grid; gap: 10px; }
        .rider-card { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 12px; border: 1px solid #e2e8f0; border-radius: 13px; padding: 12px; }
        .rider-avatar { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: #fff1ec center/cover no-repeat; color: #c2410c; font-size: 20px; font-weight: 900; }
        .rider-card__body { min-width: 0; display: grid; gap: 4px; }
        .rider-card__title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .rider-card__title strong { color: #0f172a; }
        .rider-card__title span { border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 900; }
        .rider-card__title .is-active { background: #dcfce7; color: #166534; } .rider-card__title .is-inactive { background: #e2e8f0; color: #475569; }
        .rider-card p, .rider-card small, .riders-empty { margin: 0; color: #64748b; font-style: normal; overflow-wrap: anywhere; }
        @media (min-width: 980px) { .riders-grid { grid-template-columns: minmax(340px,.72fr) minmax(0,1.28fr); align-items: start; } .riders-form-panel { position: sticky; top: 18px; } }
        @media (max-width: 620px) { .riders-form-row { grid-template-columns: 1fr; } .rider-card { grid-template-columns: auto minmax(0,1fr); } .rider-card > button { grid-column: 1 / -1; width: 100%; } }
      `}</style>
    </div>
  );
}
