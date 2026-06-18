"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ORDER_SUPPORT_CASE_STATUSES, ORDER_SUPPORT_CASE_TYPES } from "@/lib/order-support";

const toMoney = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Number(numeric.toFixed(2));
};

export default function AdminOrderSupportCaseControl({
  orderId,
  caseId = null,
  caseType = "refund",
  caseStatus = "open",
  refundAmount = 0,
  reason = "",
  adminNote = "",
  replacementOrderId = "",
}) {
  const router = useRouter();
  const [type, setType] = useState(caseType);
  const [status, setStatus] = useState(caseStatus);
  const [amount, setAmount] = useState(toMoney(refundAmount, 0));
  const [reasonText, setReasonText] = useState(reason);
  const [note, setNote] = useState(adminNote);
  const [replacementId, setReplacementId] = useState(replacementOrderId);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    if (!orderId) {
      setError("Missing order id.");
      return;
    }
    if (!reasonText.trim()) {
      setError("Reason is required.");
      return;
    }

    try {
      const response = await fetch("/api/admin/orders/support-cases/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseId || undefined,
          order_id: orderId,
          case_type: type,
          case_status: status,
          refund_amount: amount,
          reason: reasonText.trim(),
          admin_note: note.trim() || undefined,
          replacement_order_id: replacementId.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }

      setOk(caseId ? "Support case updated." : "Support case created.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error. Try again.");
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 6, maxWidth: 360 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          disabled={isPending}
          aria-label="Support case type"
          style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12, minWidth: 120 }}
        >
          {ORDER_SUPPORT_CASE_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          disabled={isPending}
          aria-label="Support case status"
          style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12, minWidth: 120 }}
        >
          {ORDER_SUPPORT_CASE_STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(toMoney(event.target.value, 0))}
          disabled={isPending}
          aria-label="Refund amount"
          placeholder="Refund"
          style={{ width: 92, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
        />
      </div>

      <input
        type="text"
        value={reasonText}
        onChange={(event) => setReasonText(event.target.value)}
        disabled={isPending}
        maxLength={200}
        placeholder="Reason"
        aria-label="Support case reason"
        style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
      />

      <input
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        disabled={isPending}
        maxLength={1000}
        placeholder="Admin note"
        aria-label="Support case admin note"
        style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
      />

      <input
        type="text"
        value={replacementId}
        onChange={(event) => setReplacementId(event.target.value)}
        disabled={isPending}
        maxLength={120}
        placeholder="Replacement order id (optional)"
        aria-label="Replacement order id"
        style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
      />

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
        {isPending ? "Saving..." : caseId ? "Save Case" : "Create Case"}
      </button>

      {error ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
      {!error && ok ? <span style={{ color: "#166534", fontSize: 12 }}>{ok}</span> : null}
    </form>
  );
}
