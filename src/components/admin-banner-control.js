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
  padding: "6px 8px",
  fontSize: 12,
};

const textAreaStyle = {
  ...fieldStyle,
  minHeight: 82,
  resize: "vertical",
  fontFamily: "inherit",
};

const toLocalDateTimeInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
};

const resolvePreviewUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;

  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!base) return raw;
  if (raw.startsWith("storage/")) return `${base}/${raw}`;
  if (raw.startsWith("/storage/")) return `${base}${raw}`;

  const cleaned = raw.replace(/^\/+/, "").replace(/^hero_banners\/+/i, "");
  return `${base}/storage/v1/object/public/hero_banners/${cleaned}`;
};

export default function AdminBannerControl({
  bannerId = null,
  placement = "hero",
  title = "",
  heading = "",
  tag = "",
  description = "",
  imageUrl = "",
  mobileImageUrl = "",
  alt = "",
  ctaLabel = "",
  ctaHref = "",
  sortOrder = "",
  accent = "",
  accentSoft = "",
  startsAt = "",
  expiresAt = "",
  isActive = true,
  submitLabel = "Save Banner",
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState({
    title: String(title || ""),
    heading: String(heading || ""),
    tag: String(tag || ""),
    description: String(description || ""),
    imageUrl: String(imageUrl || ""),
    mobileImageUrl: String(mobileImageUrl || ""),
    alt: String(alt || ""),
    ctaLabel: String(ctaLabel || ""),
    ctaHref: String(ctaHref || ""),
    sortOrder: sortOrder === "" || sortOrder == null ? "" : String(sortOrder),
    accent: String(accent || ""),
    accentSoft: String(accentSoft || ""),
    startsAt: toLocalDateTimeInput(startsAt),
    expiresAt: toLocalDateTimeInput(expiresAt),
    isActive: isActive !== false,
  });

  useEffect(() => {
    setForm({
      title: String(title || ""),
      heading: String(heading || ""),
      tag: String(tag || ""),
      description: String(description || ""),
      imageUrl: String(imageUrl || ""),
      mobileImageUrl: String(mobileImageUrl || ""),
      alt: String(alt || ""),
      ctaLabel: String(ctaLabel || ""),
      ctaHref: String(ctaHref || ""),
      sortOrder: sortOrder === "" || sortOrder == null ? "" : String(sortOrder),
      accent: String(accent || ""),
      accentSoft: String(accentSoft || ""),
      startsAt: toLocalDateTimeInput(startsAt),
      expiresAt: toLocalDateTimeInput(expiresAt),
      isActive: isActive !== false,
    });
    setError("");
    setOk("");
  }, [
    accent,
    accentSoft,
    alt,
    ctaHref,
    ctaLabel,
    description,
    expiresAt,
    heading,
    imageUrl,
    isActive,
    mobileImageUrl,
    sortOrder,
    startsAt,
    tag,
    title,
  ]);

  const disabled = saving || isPending;
  const previewImage = useMemo(() => resolvePreviewUrl(form.imageUrl), [form.imageUrl]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    const trimmedImageUrl = String(form.imageUrl || "").trim();
    if (!trimmedImageUrl) {
      setError("Enter a banner image URL or storage path.");
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
      const response = await fetch("/api/admin/banners/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bannerId,
          placement,
          title: String(form.title || "").trim() || null,
          heading: String(form.heading || "").trim() || null,
          tag: String(form.tag || "").trim() || null,
          description: String(form.description || "").trim() || null,
          image_url: trimmedImageUrl,
          mobile_image_url: String(form.mobileImageUrl || "").trim() || null,
          alt: String(form.alt || "").trim() || null,
          cta_label: String(form.ctaLabel || "").trim() || null,
          cta_href: String(form.ctaHref || "").trim() || null,
          sort_order: form.sortOrder === "" ? null : Number(form.sortOrder),
          accent: String(form.accent || "").trim() || null,
          accent_soft: String(form.accentSoft || "").trim() || null,
          starts_at: startsAtIso,
          expires_at: expiresAtIso,
          is_active: form.isActive,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }

      setOk(bannerId ? "Banner updated." : "Banner created.");
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
    <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Banner Title</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                maxLength={140}
                disabled={disabled}
                placeholder="Friday Market Rush"
                style={fieldStyle}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Campaign Tag</span>
              <input
                type="text"
                value={form.tag}
                onChange={(event) => updateField("tag", event.target.value)}
                maxLength={80}
                disabled={disabled}
                placeholder="#WeekendDrop"
                style={fieldStyle}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Sort Order</span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.sortOrder}
                onChange={(event) => updateField("sortOrder", event.target.value)}
                disabled={disabled}
                placeholder="10"
                style={fieldStyle}
              />
            </label>
          </div>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>Heading</span>
            <textarea
              value={form.heading}
              onChange={(event) => updateField("heading", event.target.value)}
              disabled={disabled}
              placeholder={"Fresh Deals,\nReady for Delivery"}
              style={textAreaStyle}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>Description</span>
            <textarea
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              disabled={disabled}
              placeholder="Set the campaign message customers should see on the homepage hero."
              style={textAreaStyle}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Desktop Image</span>
              <input
                type="text"
                value={form.imageUrl}
                onChange={(event) => updateField("imageUrl", event.target.value)}
                disabled={disabled}
                placeholder="hero_banners/friday-market.png"
                style={fieldStyle}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Mobile Image</span>
              <input
                type="text"
                value={form.mobileImageUrl}
                onChange={(event) => updateField("mobileImageUrl", event.target.value)}
                disabled={disabled}
                placeholder="Optional mobile-specific image"
                style={fieldStyle}
              />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>CTA Label</span>
              <input
                type="text"
                value={form.ctaLabel}
                onChange={(event) => updateField("ctaLabel", event.target.value)}
                maxLength={48}
                disabled={disabled}
                placeholder="Shop the drop"
                style={fieldStyle}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>CTA Link</span>
              <input
                type="text"
                value={form.ctaHref}
                onChange={(event) => updateField("ctaHref", event.target.value)}
                disabled={disabled}
                placeholder="/section/fresh-arrivals"
                style={fieldStyle}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Alt Text</span>
              <input
                type="text"
                value={form.alt}
                onChange={(event) => updateField("alt", event.target.value)}
                maxLength={160}
                disabled={disabled}
                placeholder="Hero campaign banner"
                style={fieldStyle}
              />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Accent</span>
              <input
                type="text"
                value={form.accent}
                onChange={(event) => updateField("accent", event.target.value)}
                disabled={disabled}
                placeholder="#ef4444"
                style={fieldStyle}
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Accent Soft</span>
              <input
                type="text"
                value={form.accentSoft}
                onChange={(event) => updateField("accentSoft", event.target.value)}
                disabled={disabled}
                placeholder="rgba(239, 68, 68, 0.22)"
                style={fieldStyle}
              />
            </label>

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
          </div>
        </div>

        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            background: "#f8fafc",
            padding: 10,
            display: "grid",
            gap: 8,
            alignContent: "start",
          }}
        >
          <strong style={{ fontSize: 13 }}>Preview</strong>
          <div
            style={{
              position: "relative",
              borderRadius: 10,
              overflow: "hidden",
              minHeight: 180,
              background: form.accentSoft || "rgba(15, 23, 42, 0.06)",
              border: "1px solid rgba(148, 163, 184, 0.35)",
            }}
          >
            {previewImage ? (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url("${previewImage.replace(/"/g, '\\"')}")`,
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "cover",
                }}
              />
            ) : null}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(180deg, rgba(15, 23, 42, 0.12), rgba(15, 23, 42, 0.68))",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                gap: 6,
                padding: 12,
                color: "#ffffff",
              }}
            >
              {form.tag ? (
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: form.accent || "#f8fafc" }}>
                  {form.tag}
                </span>
              ) : null}
              {form.heading ? (
                <strong style={{ fontSize: 18, lineHeight: 1.1, whiteSpace: "pre-line" }}>{form.heading}</strong>
              ) : form.title ? (
                <strong style={{ fontSize: 18, lineHeight: 1.1 }}>{form.title}</strong>
              ) : null}
              {form.description ? <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>{form.description}</p> : null}
              {form.ctaLabel && form.ctaHref ? (
                <span
                  style={{
                    width: "fit-content",
                    marginTop: 4,
                    background: form.accent || "#0f172a",
                    color: "#ffffff",
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {form.ctaLabel}
                </span>
              ) : null}
            </div>
          </div>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>
            Use a full URL, a root-relative path, `storage/...`, or just the `hero_banners` file key.
          </p>
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32 }}>
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) => updateField("isActive", event.target.checked)}
          disabled={disabled}
        />
        <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 600 }}>Show this banner when its schedule is live</span>
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="submit"
          disabled={disabled}
          style={{
            border: "1px solid #0f172a",
            borderRadius: 6,
            background: "#0f172a",
            color: "#ffffff",
            padding: "7px 10px",
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
