"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
  padding: "7px 8px",
  fontSize: 13,
};

const textAreaStyle = {
  ...fieldStyle,
  minHeight: 92,
  resize: "vertical",
  fontFamily: "inherit",
};

const toLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
};

const createEmptyForm = () => ({
  id: null,
  title: "",
  body: "",
  severity: "warning",
  startsAt: "",
  expiresAt: "",
  isActive: true,
});

const severityStyles = {
  success: { label: "Green", bg: "#dcfce7", color: "#166534" },
  warning: { label: "Yellow", bg: "#fef3c7", color: "#854d0e" },
  error: { label: "Red", bg: "#fee2e2", color: "#991b1b" },
};

export default function AdminSiteNotificationControl({ records = [] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState(createEmptyForm);

  const activeRecord = useMemo(() => records.find((record) => record.status === "live") || null, [records]);

  useEffect(() => {
    if (!activeRecord) return;
    setForm({
      id: activeRecord.id,
      title: activeRecord.title || "",
      body: activeRecord.body || "",
      severity: activeRecord.severity || "warning",
      startsAt: toLocalInput(activeRecord.startsAt),
      expiresAt: toLocalInput(activeRecord.expiresAt),
      isActive: activeRecord.isActive !== false,
    });
  }, [activeRecord]);

  const disabled = saving || isPending;
  const tone = severityStyles[form.severity] || severityStyles.warning;

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const loadRecord = (record) => {
    setError("");
    setOk("");
    setForm({
      id: record.id,
      title: record.title || "",
      body: record.body || "",
      severity: record.severity || "warning",
      startsAt: toLocalInput(record.startsAt),
      expiresAt: toLocalInput(record.expiresAt),
      isActive: record.isActive !== false,
    });
  };

  const deactivateRecord = async (record) => {
    setSaving(true);
    setError("");
    setOk("");
    try {
      const response = await fetch("/api/admin/site-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: record.id,
          title: record.title,
          body: record.body,
          severity: record.severity,
          is_active: false,
          starts_at: record.startsAt,
          expires_at: record.expiresAt,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }
      setOk("Notification deactivated. It will no longer appear on the storefront.");
      startTransition(() => router.refresh());
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    if (!form.title.trim() || !form.body.trim()) {
      setError("Enter both header text and notification text.");
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
    if (startsAtIso && expiresAtIso && Date.parse(expiresAtIso) <= Date.parse(startsAtIso)) {
      setError("Expiry must be after start time.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/site-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          title: form.title.trim(),
          body: form.body.trim(),
          severity: form.severity,
          is_active: form.isActive,
          starts_at: startsAtIso,
          expires_at: expiresAtIso,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }
      setOk(form.isActive ? "Notification saved and active." : "Notification saved as inactive.");
      startTransition(() => router.refresh());
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", marginBottom: 16 }}>
      <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid #e2e8f0" }}>
        <strong>Site Notification</strong>
        <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
          Send a dismissible storefront popup with green, yellow, or red severity.
        </p>
      </div>

      <div style={{ padding: 12, display: "grid", gap: 12 }}>
        <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Header Text</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                disabled={disabled}
                maxLength={140}
                placeholder="You're Away from Your Selected Location"
                style={fieldStyle}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Severity</span>
              <select
                value={form.severity}
                onChange={(event) => updateField("severity", event.target.value)}
                disabled={disabled}
                style={fieldStyle}
              >
                <option value="success">Green - Success / Promo</option>
                <option value="warning">Yellow - Warning / Notice</option>
                <option value="error">Red - Critical / Stop</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#0f172a", fontSize: 13, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => updateField("isActive", event.target.checked)}
                disabled={disabled}
              />
              Enabled on storefront
            </label>
          </div>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>Notification Text</span>
            <textarea
              value={form.body}
              onChange={(event) => updateField("body", event.target.value)}
              disabled={disabled}
              maxLength={700}
              placeholder="To see restaurants near you, update your location. Or continue with your selected address."
              style={textAreaStyle}
            />
          </label>

          <div style={{ border: `1px solid ${tone.color}`, borderRadius: 12, background: tone.bg, color: tone.color, padding: 12 }}>
            <span style={{ display: "block", marginBottom: 5, fontSize: 11, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase" }}>Storefront preview</span>
            <strong>{form.title.trim() || "Notification heading"}</strong>
            <p style={{ margin: "5px 0 0", fontSize: 13 }}>{form.body.trim() || "Your notification text will appear here."}</p>
          </div>

          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Starts At</span>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => updateField("startsAt", event.target.value)}
                disabled={disabled}
                style={fieldStyle}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Expires At</span>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) => updateField("expiresAt", event.target.value)}
                disabled={disabled}
                style={fieldStyle}
              />
            </label>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span style={{ borderRadius: 999, padding: "4px 9px", background: tone.bg, color: tone.color, fontSize: 12, fontWeight: 800 }}>
              {tone.label} severity preview
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setForm(createEmptyForm());
                  setError("");
                  setOk("");
                }}
                disabled={disabled}
                style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#ffffff", padding: "8px 12px", fontWeight: 700 }}
              >
                New
              </button>
              <button
                type="submit"
                disabled={disabled}
                style={{ border: 0, borderRadius: 8, background: "#0f172a", color: "#ffffff", padding: "8px 12px", fontWeight: 700 }}
              >
                {disabled ? "Saving..." : form.id ? "Save Notification" : "Create Notification"}
              </button>
            </div>
          </div>
          {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13, fontWeight: 700 }}>{error}</p> : null}
          {ok ? <p style={{ margin: 0, color: "#166534", fontSize: 13, fontWeight: 700 }}>{ok}</p> : null}
        </form>

        <div style={{ display: "grid", gap: 8 }}>
          {records.slice(0, 5).map((record) => {
            const recordTone = severityStyles[record.severity] || severityStyles.warning;
            return (
              <article key={record.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <strong>{record.title}</strong>
                    <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>{record.body}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ borderRadius: 999, padding: "3px 8px", background: recordTone.bg, color: recordTone.color, fontSize: 12, fontWeight: 800 }}>
                      {record.statusLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => loadRecord(record)}
                      style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#ffffff", padding: "6px 10px", fontWeight: 700 }}
                    >
                      Edit
                    </button>
                    {record.isActive ? (
                      <button
                        type="button"
                        onClick={() => deactivateRecord(record)}
                        disabled={disabled}
                        style={{ border: "1px solid #fecaca", borderRadius: 8, background: "#fff", color: "#b91c1c", padding: "6px 10px", fontWeight: 700 }}
                      >
                        Deactivate
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
          {!records.length ? <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>No site notifications yet.</p> : null}
        </div>
      </div>
    </section>
  );
}
