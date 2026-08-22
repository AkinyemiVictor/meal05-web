"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminAvailabilityItemControl({ requestId, item }) {
  const router = useRouter(); const [price, setPrice] = useState(String(item.confirmed_unit_price ?? item.submitted_unit_price ?? ""));
  const [note, setNote] = useState(item.admin_note || ""); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const update = async (resolutionStatus) => {
    setBusy(resolutionStatus); setError("");
    const response = await fetch(`/api/admin/availability-requests/${requestId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id, resolutionStatus, confirmedUnitPrice: Number(price), adminNote: note }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "Unable to save"); setBusy(""); return; }
    router.refresh(); setBusy("");
  };
  return <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
    <label style={{ display: "grid", gap: 4 }}>Confirmed unit price<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} style={{ minHeight: 36 }} /></label>
    <label style={{ display: "grid", gap: 4 }}>Note<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} style={{ minHeight: 36 }} /></label>
    <div style={{ display: "flex", gap: 8 }}><button disabled={Boolean(busy)} onClick={() => update("confirmed")}>{busy === "confirmed" ? "Saving…" : "Confirm item"}</button><button disabled={Boolean(busy)} onClick={() => update("unavailable")}>{busy === "unavailable" ? "Saving…" : "Mark unavailable"}</button></div>
    {error ? <span style={{ color: "#b91c1c" }}>{error}</span> : null}
  </div>;
}

