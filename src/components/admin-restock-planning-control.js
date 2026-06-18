"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const toText = (value) => String(value ?? "").trim();

const toMoneyInput = (value) => {
  if (value == null || value === "") return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : "";
};

const toDateInput = (value) => {
  const text = toText(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "";
};

export default function AdminRestockPlanningControl({
  variantId,
  supplierName = "",
  purchaseCost = null,
  leadTimeDays = null,
  lastRestockDate = "",
  expectedRestockDate = "",
}) {
  const router = useRouter();
  const [supplier, setSupplier] = useState(toText(supplierName));
  const [cost, setCost] = useState(toMoneyInput(purchaseCost));
  const [leadTime, setLeadTime] = useState(leadTimeDays == null ? "" : String(leadTimeDays));
  const [lastRestock, setLastRestock] = useState(toDateInput(lastRestockDate));
  const [expectedRestock, setExpectedRestock] = useState(toDateInput(expectedRestockDate));
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    if (!variantId) {
      setError("Missing variant id.");
      return;
    }

    try {
      const response = await fetch("/api/admin/inventory/restock-planning/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_id: variantId,
          supplier_name: supplier || undefined,
          purchase_cost: cost || null,
          lead_time_days: leadTime || null,
          last_restock_date: lastRestock || null,
          expected_restock_date: expectedRestock || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }

      setOk("Planning saved.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error. Try again.");
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 6, minWidth: 320 }}>
      <input
        type="text"
        value={supplier}
        onChange={(event) => setSupplier(event.target.value)}
        disabled={isPending}
        maxLength={160}
        placeholder="Supplier name"
        aria-label="Supplier name"
        style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={cost}
          onChange={(event) => setCost(event.target.value)}
          disabled={isPending}
          placeholder="Purchase cost"
          aria-label="Purchase cost"
          style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
        />
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={365}
          step={1}
          value={leadTime}
          onChange={(event) => setLeadTime(event.target.value)}
          disabled={isPending}
          placeholder="Lead time (days)"
          aria-label="Lead time days"
          style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ color: "#475569", fontSize: 11, fontWeight: 600 }}>Last restock</span>
          <input
            type="date"
            value={lastRestock}
            onChange={(event) => setLastRestock(event.target.value)}
            disabled={isPending}
            aria-label="Last restock date"
            style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ color: "#475569", fontSize: 11, fontWeight: 600 }}>Expected restock</span>
          <input
            type="date"
            value={expectedRestock}
            onChange={(event) => setExpectedRestock(event.target.value)}
            disabled={isPending}
            aria-label="Expected restock date"
            style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending}
        style={{
          justifySelf: "start",
          border: "1px solid #0f172a",
          borderRadius: 6,
          background: "#0f172a",
          color: "#ffffff",
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: isPending ? "not-allowed" : "pointer",
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? "Saving..." : "Save Planning"}
      </button>

      {error ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
      {!error && ok ? <span style={{ color: "#166534", fontSize: 12 }}>{ok}</span> : null}
    </form>
  );
}
