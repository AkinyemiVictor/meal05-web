"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const terminalStatuses = new Set(["verified", "success", "successful", "rejected", "failed", "cancelled", "expired", "refunded", "reversed"]);

export default function PaymentActions({ paymentId, status }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const disabled = isPending || terminalStatuses.has(String(status || "").toLowerCase());

  const runAction = async (action) => {
    setMessage("");
    let body;
    if (action === "reject") {
      const reason = window.prompt("Customer-visible reason for rejecting this payment");
      if (!reason || !reason.trim()) return;
      body = JSON.stringify({ reason: reason.trim() });
    }

    startTransition(async () => {
      const response = await fetch(`/api/admin/payments/${paymentId}/${action}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload.error || `Unable to ${action} payment.`);
        return;
      }
      setMessage(action === "verify" ? "Verified" : "Rejected");
      router.refresh();
    });
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => runAction("verify")}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #16a34a", background: "#dcfce7", color: "#166534", fontWeight: 800, opacity: disabled ? 0.55 : 1 }}
        >
          Verify
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => runAction("reject")}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #dc2626", background: "#fee2e2", color: "#991b1b", fontWeight: 800, opacity: disabled ? 0.55 : 1 }}
        >
          Reject
        </button>
      </div>
      {message ? <span style={{ color: message === "Verified" || message === "Rejected" ? "#166534" : "#b91c1c", fontSize: 12, fontWeight: 700 }}>{message}</span> : null}
    </div>
  );
}
