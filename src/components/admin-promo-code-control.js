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

const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12,
};

const toLocalDateTimeInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
};

export default function AdminPromoCodeControl({
  promoId = null,
  code = "",
  description = "",
  discountType = "percent",
  discountValue = "",
  minSubtotal = "",
  maxDiscount = "",
  startsAt = "",
  expiresAt = "",
  usageLimit = "",
  isActive = true,
  submitLabel = "Save",
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    code: String(code || ""),
    description: String(description || ""),
    discountType: String(discountType || "percent"),
    discountValue: discountValue === "" || discountValue == null ? "" : String(discountValue),
    minSubtotal: minSubtotal === "" || minSubtotal == null ? "" : String(minSubtotal),
    maxDiscount: maxDiscount === "" || maxDiscount == null ? "" : String(maxDiscount),
    startsAt: toLocalDateTimeInput(startsAt),
    expiresAt: toLocalDateTimeInput(expiresAt),
    usageLimit: usageLimit === "" || usageLimit == null ? "" : String(usageLimit),
    isActive: isActive !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    setForm({
      code: String(code || ""),
      description: String(description || ""),
      discountType: String(discountType || "percent"),
      discountValue: discountValue === "" || discountValue == null ? "" : String(discountValue),
      minSubtotal: minSubtotal === "" || minSubtotal == null ? "" : String(minSubtotal),
      maxDiscount: maxDiscount === "" || maxDiscount == null ? "" : String(maxDiscount),
      startsAt: toLocalDateTimeInput(startsAt),
      expiresAt: toLocalDateTimeInput(expiresAt),
      usageLimit: usageLimit === "" || usageLimit == null ? "" : String(usageLimit),
      isActive: isActive !== false,
    });
    setError("");
    setOk("");
  }, [code, description, discountType, discountValue, expiresAt, isActive, maxDiscount, minSubtotal, startsAt, usageLimit]);

  const disabled = saving || isPending;

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    const trimmedCode = String(form.code || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!trimmedCode) {
      setError("Enter a promo code.");
      return;
    }

    const discountValueNumber = Number(form.discountValue);
    if (!Number.isFinite(discountValueNumber) || discountValueNumber <= 0) {
      setError("Enter a valid discount value.");
      return;
    }

    const startsAtIso = form.startsAt ? new Date(form.startsAt).toISOString() : null;
    const expiresAtIso = form.expiresAt ? new Date(form.expiresAt).toISOString() : null;
    if (form.startsAt && Number.isNaN(new Date(form.startsAt).getTime())) {
      setError("Enter a valid start time.");
      return;
    }
    if (form.expiresAt && Number.isNaN(new Date(form.expiresAt).getTime())) {
      setError("Enter a valid expiry time.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/promo-codes/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: promoId,
          code: trimmedCode,
          description: String(form.description || "").trim() || null,
          discount_type: form.discountType,
          discount_value: discountValueNumber,
          min_subtotal: form.minSubtotal === "" ? null : Number(form.minSubtotal),
          max_discount: form.discountType === "delivery" || form.maxDiscount === "" ? null : Number(form.maxDiscount),
          starts_at: startsAtIso,
          expires_at: expiresAtIso,
          usage_limit: form.usageLimit === "" ? null : Number(form.usageLimit),
          is_active: form.isActive,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }

      setOk(promoId ? "Promo code updated." : "Promo code created.");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Code</span>
          <input
            type="text"
            value={form.code}
            onChange={(event) => updateField("code", event.target.value.toUpperCase())}
            maxLength={32}
            disabled={disabled}
            placeholder="FRESHSAVE"
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Type</span>
          <select
            value={form.discountType}
            onChange={(event) => updateField("discountType", event.target.value)}
            disabled={disabled}
            style={fieldStyle}
          >
            <option value="percent">Percent</option>
            <option value="fixed">Fixed</option>
            <option value="delivery">Delivery</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Value</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.discountValue}
            onChange={(event) => updateField("discountValue", event.target.value)}
            disabled={disabled}
            placeholder={form.discountType === "percent" ? "10" : "1500"}
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Minimum</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.minSubtotal}
            onChange={(event) => updateField("minSubtotal", event.target.value)}
            disabled={disabled}
            placeholder="Optional"
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Max Discount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.maxDiscount}
            onChange={(event) => updateField("maxDiscount", event.target.value)}
            disabled={disabled || form.discountType === "delivery"}
            placeholder="Optional"
            style={fieldStyle}
          />
        </label>
      </div>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={labelStyle}>Description</span>
        <input
          type="text"
          value={form.description}
          onChange={(event) => updateField("description", event.target.value)}
          maxLength={160}
          disabled={disabled}
          placeholder="10% off everything"
          style={fieldStyle}
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Starts</span>
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => updateField("startsAt", event.target.value)}
            disabled={disabled}
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Expires</span>
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) => updateField("expiresAt", event.target.value)}
            disabled={disabled}
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Usage Limit</span>
          <input
            type="number"
            min="1"
            step="1"
            value={form.usageLimit}
            onChange={(event) => updateField("usageLimit", event.target.value)}
            disabled={disabled}
            placeholder="Optional"
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32, alignSelf: "end" }}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => updateField("isActive", event.target.checked)}
            disabled={disabled}
          />
          <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 600 }}>Active</span>
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
          {disabled ? "Saving..." : submitLabel}
        </button>
        {error ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
        {!error && ok ? <span style={{ color: "#166534", fontSize: 12 }}>{ok}</span> : null}
      </div>
    </form>
  );
}
