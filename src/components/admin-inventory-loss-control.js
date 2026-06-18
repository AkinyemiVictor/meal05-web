"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { INVENTORY_LOSS_TYPE_OPTIONS, getInventoryLossTypeLabel } from "@/lib/inventory-loss";

const toPositiveInt = (value, fallback = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
};

export default function AdminInventoryLossControl({ variantId, stockCount = null }) {
  const router = useRouter();
  const [lossType, setLossType] = useState("spoilage");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [isPending, startTransition] = useTransition();

  const stockKnown = Number.isFinite(Number(stockCount));
  const availableStock = stockKnown ? Math.max(0, Math.floor(Number(stockCount))) : null;
  const disabled = isPending || !stockKnown || availableStock < 1;

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
    if (availableStock < 1) {
      setError("No stock available to write off.");
      return;
    }

    const qty = toPositiveInt(quantity, 0);
    if (qty < 1) {
      setError("Quantity must be at least 1.");
      return;
    }
    if (qty > availableStock) {
      setError("Quantity exceeds current stock.");
      return;
    }

    try {
      const response = await fetch("/api/admin/inventory/losses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_id: variantId,
          quantity: qty,
          loss_type: lossType,
          note: note.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }

      setOk(`Recorded ${getInventoryLossTypeLabel(lossType).toLowerCase()} (-${qty})`);
      setQuantity(1);
      setNote("");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error. Try again.");
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 6, maxWidth: 320 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={lossType}
          onChange={(event) => setLossType(event.target.value)}
          disabled={disabled}
          aria-label="Inventory loss type"
          style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12, minWidth: 132 }}
        >
          {INVENTORY_LOSS_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={availableStock != null ? availableStock : undefined}
          step={1}
          value={quantity}
          onChange={(event) => setQuantity(toPositiveInt(event.target.value, 1))}
          disabled={disabled}
          aria-label="Inventory loss quantity"
          style={{ width: 72, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
        />
        <button
          type="submit"
          disabled={disabled}
          style={{
            border: "1px solid #991b1b",
            borderRadius: 6,
            background: "#991b1b",
            color: "#ffffff",
            padding: "5px 8px",
            fontSize: 12,
            fontWeight: 600,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.7 : 1,
          }}
        >
          {isPending ? "Saving..." : "Record Loss"}
        </button>
      </div>

      <input
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        disabled={disabled}
        maxLength={500}
        placeholder="Optional note"
        aria-label="Inventory loss note"
        style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
      />

      {availableStock != null ? (
        <span style={{ color: "#64748b", fontSize: 12 }}>Available stock: {availableStock}</span>
      ) : null}
      {error ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
      {!error && ok ? <span style={{ color: "#166534", fontSize: 12 }}>{ok}</span> : null}
    </form>
  );
}
