"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const labelStyle = {
  color: "#475569",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const toLocalDateTimeInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
};

export default function AdminProductPromoControl({
  productId,
  productName,
  promoTagText = null,
  promoTagExpiresAt = null,
  promoTagEnabled = false,
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialText = String(promoTagText || "");
  const initialExpiry = toLocalDateTimeInput(promoTagExpiresAt);
  const initialEnabled = promoTagEnabled === true;
  const [textValue, setTextValue] = useState(initialText);
  const [expiryValue, setExpiryValue] = useState(initialExpiry);
  const [enabledValue, setEnabledValue] = useState(initialEnabled);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const disabled = isSaving || isPending;

  useEffect(() => {
    setTextValue(initialText);
    setExpiryValue(initialExpiry);
    setEnabledValue(initialEnabled);
    setError("");
    setOk("");
  }, [initialEnabled, initialExpiry, initialText]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    const trimmedText = String(textValue || "").trim();
    if (enabledValue && !trimmedText) {
      setError("Enter promo text before enabling the ribbon.");
      return;
    }

    const requestedEnabled = trimmedText ? enabledValue : false;
    const isoExpiry = trimmedText && expiryValue ? new Date(expiryValue).toISOString() : null;
    if (trimmedText && expiryValue && Number.isNaN(new Date(expiryValue).getTime())) {
      setError("Enter a valid expiry date.");
      return;
    }

    if (trimmedText.length > 80) {
      setError("Promo text must be 80 characters or less.");
      return;
    }

    const changed =
      trimmedText !== initialText ||
      (isoExpiry || "") !== (promoTagExpiresAt || "") ||
      requestedEnabled !== initialEnabled;
    if (!changed) {
      setError("No change selected.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/products/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          promo_tag_text: trimmedText || null,
          promo_tag_expires_at: trimmedText ? isoExpiry : null,
          promo_tag_enabled: requestedEnabled,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }

      if (!trimmedText) {
        setOk("Promo ribbon cleared and hidden.");
      } else if (requestedEnabled) {
        setOk("Promo ribbon saved and enabled.");
      } else {
        setOk("Promo ribbon saved but hidden.");
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={{ display: "grid", gap: 4, minWidth: 220 }}>
        <span style={labelStyle}>Promo Text</span>
        <input
          type="text"
          value={textValue}
          onChange={(event) => setTextValue(event.target.value)}
          maxLength={80}
          disabled={disabled}
          placeholder="On Promo"
          aria-label={`Promo text for ${productName}`}
          style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={labelStyle}>Expiry</span>
        <input
          type="datetime-local"
          value={expiryValue}
          onChange={(event) => setExpiryValue(event.target.value)}
          disabled={disabled || !String(textValue || "").trim()}
          aria-label={`Promo expiry for ${productName}`}
          style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
        />
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32 }}>
        <input
          type="checkbox"
          checked={enabledValue}
          onChange={(event) => setEnabledValue(event.target.checked)}
          disabled={disabled}
          aria-label={`Show promo ribbon for ${productName}`}
        />
        <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 600 }}>Show ribbon on storefront</span>
      </label>

      <button
        type="submit"
        disabled={disabled}
        style={{
          border: "1px solid #0f172a",
          borderRadius: 6,
          background: "#0f172a",
          color: "#ffffff",
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1,
        }}
      >
        {disabled ? "Saving..." : "Save"}
      </button>

      {error ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
      {!error && ok ? <span style={{ color: "#166534", fontSize: 12 }}>{ok}</span> : null}
    </form>
  );
}
