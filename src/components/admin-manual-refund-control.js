"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const toneByStatus = {
  pending: { background: "#fef3c7", color: "#854d0e", label: "Awaiting bank transfer" },
  refunded: { background: "#dcfce7", color: "#166534", label: "Refunded manually" },
  not_required: { background: "#e2e8f0", color: "#334155", label: "No refund required" },
};

export default function AdminManualRefundControl({
  caseId,
  refundStatus = "pending",
  refundAmount = 0,
  refundReference = "",
  refundedAt = null,
  refundedByEmail = "",
}) {
  const router = useRouter();
  const [reference, setReference] = useState(refundReference || "");
  const [decision, setDecision] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const disabled = saving || isPending;
  const tone = toneByStatus[refundStatus] || toneByStatus.pending;

  const saveDecision = async () => {
    if (!caseId || !decision) return;
    setSaving(true);
    setError("");
    setOk("");
    try {
      const response = await fetch("/api/admin/orders/support-cases/refund-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseId,
          refund_status: decision,
          refund_reference: decision === "refunded" ? reference.trim() || undefined : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }
      setOk(
        decision === "refunded"
          ? "Recorded as manually refunded. No bank transfer was initiated by Meal05."
          : decision === "not_required"
            ? "Case closed with no refund required."
            : "Refund decision reopened."
      );
      setDecision("");
      startTransition(() => router.refresh());
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minWidth: 250, display: "grid", gap: 8 }}>
      <div>
        <span style={{ display: "inline-block", borderRadius: 999, padding: "4px 9px", background: tone.background, color: tone.color, fontSize: 12, fontWeight: 800 }}>
          {tone.label}
        </span>
        {refundedAt ? (
          <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12 }}>
            {new Date(refundedAt).toLocaleString()}{refundedByEmail ? ` by ${refundedByEmail}` : ""}
          </p>
        ) : null}
      </div>

      {refundStatus === "pending" ? (
        <>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: "#475569", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Bank reference (optional)
            </span>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              disabled={disabled}
              maxLength={160}
              placeholder="Transfer reference or receipt ID"
              style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 9px", fontSize: 12 }}
            />
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setDecision("refunded")} disabled={disabled || Number(refundAmount) <= 0} style={{ border: 0, borderRadius: 8, background: "#166534", color: "#fff", padding: "7px 10px", fontSize: 12, fontWeight: 800 }}>
              Mark as refunded
            </button>
            <button type="button" onClick={() => setDecision("not_required")} disabled={disabled} style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#334155", padding: "7px 10px", fontSize: 12, fontWeight: 800 }}>
              No refund required
            </button>
          </div>
          {Number(refundAmount) <= 0 ? <p style={{ margin: 0, color: "#9a3412", fontSize: 12 }}>Enter a refund amount before confirming a transfer.</p> : null}
        </>
      ) : (
        <button type="button" onClick={() => setDecision("pending")} disabled={disabled} style={{ justifySelf: "start", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#334155", padding: "6px 9px", fontSize: 12, fontWeight: 700 }}>
          Reopen decision
        </button>
      )}

      {decision ? (
        <div role="alertdialog" aria-label="Confirm refund decision" style={{ border: "1px solid #fed7aa", borderRadius: 10, background: "#fff7ed", padding: 10, display: "grid", gap: 8 }}>
          <strong style={{ color: "#9a3412", fontSize: 13 }}>
            {decision === "refunded"
              ? "Confirm that you already completed the bank transfer."
              : decision === "not_required"
                ? "Confirm that this case needs no refund."
                : "Reopen this refund decision for review?"}
          </strong>
          <p style={{ margin: 0, color: "#7c2d12", fontSize: 12 }}>Meal05 will only save this decision; it will not move any money.</p>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={saveDecision} disabled={disabled} style={{ border: 0, borderRadius: 7, background: "#0f172a", color: "#fff", padding: "6px 9px", fontSize: 12, fontWeight: 800 }}>
              {disabled ? "Saving..." : "Confirm"}
            </button>
            <button type="button" onClick={() => setDecision("")} disabled={disabled} style={{ border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", padding: "6px 9px", fontSize: 12, fontWeight: 700 }}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: 12, fontWeight: 700 }}>{error}</p> : null}
      {ok ? <p style={{ margin: 0, color: "#166534", fontSize: 12, fontWeight: 700 }}>{ok}</p> : null}
    </div>
  );
}
