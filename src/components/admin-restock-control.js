"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const toPositiveInt = (value, fallback = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
};

export default function AdminRestockControl({ variantId, stockKnown = true }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(10);
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
    if (!stockKnown) {
      setError("Stock unavailable for this row.");
      return;
    }

    const qty = toPositiveInt(quantity, 0);
    if (qty < 1) {
      setError("Quantity must be at least 1.");
      return;
    }

    try {
      const response = await fetch("/api/admin/inventory/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_id: variantId,
          quantity: qty,
          reason: "restock",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = [payload?.error, payload?.hint].filter(Boolean).join(" ");
        setError(details || `Request failed (${response.status})`);
        return;
      }

      const warning = String(payload?.warning || "").trim();
      const suffix = payload?.fallback ? " via direct update" : "";
      setOk(`Added +${qty}${suffix}${warning ? `. ${warning}` : ""}`);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error. Try again.");
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={quantity}
        onChange={(event) => setQuantity(toPositiveInt(event.target.value, 1))}
        disabled={isPending || !stockKnown}
        style={{
          width: 72,
          border: "1px solid #cbd5e1",
          borderRadius: 6,
          padding: "5px 6px",
          fontSize: 12,
        }}
        aria-label="Restock quantity"
      />
      <button
        type="submit"
        disabled={isPending || !stockKnown}
        style={{
          border: "1px solid #0f172a",
          borderRadius: 6,
          background: "#0f172a",
          color: "#ffffff",
          padding: "5px 8px",
          fontSize: 12,
          fontWeight: 600,
          cursor: isPending || !stockKnown ? "not-allowed" : "pointer",
          opacity: isPending || !stockKnown ? 0.7 : 1,
        }}
      >
        {isPending ? "Saving..." : "Restock"}
      </button>
      {error ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
      {!error && ok ? <span style={{ color: "#166534", fontSize: 12 }}>{ok}</span> : null}
    </form>
  );
}
