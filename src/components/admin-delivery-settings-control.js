"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_SERVICE_ZONE_FEES, normalizeServiceZoneFees } from "@/lib/delivery-settings";

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

const smallButtonStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 999,
  background: "#ffffff",
  color: "#0f172a",
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const getSubzoneCount = (text) =>
  String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length;

const parseSubzoneLines = (text) => {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const pipeSplit = line.split("|").map((part) => part.trim());
    if (pipeSplit.length >= 2) {
      return { name: pipeSplit[0], fee: pipeSplit.slice(1).join("|") };
    }
    const match = line.match(/^(.+?)\s*[:\-]\s*(\d+(?:\.\d+)?)$/);
    if (match) {
      return { name: match[1].trim(), fee: match[2].trim() };
    }
    return { name: line, fee: "" };
  });
};

const buildZoneRows = (source, fallbackFee) => {
  const normalized = normalizeServiceZoneFees(source, fallbackFee);
  return normalized.map((zone) => ({
    name: zone.name,
    fee: String(zone.fee ?? fallbackFee ?? 0),
    subzonesText: (zone.subzones || [])
      .map((subzone) => `${subzone.name} | ${subzone.fee}`)
      .join("\n"),
  }));
};

export default function AdminDeliverySettingsControl({
  deliveryFee = 1500,
  freeDeliveryThreshold = 40000,
  sameDayEnabled = true,
  sameDayCutoffTime = "16:00",
  serviceZones = DEFAULT_SERVICE_ZONE_FEES.map((zone) => zone.name),
  serviceZoneFees = DEFAULT_SERVICE_ZONE_FEES,
  sameDayNotice = "",
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [expandedZones, setExpandedZones] = useState({});
  const [form, setForm] = useState({
    deliveryFee: String(deliveryFee),
    freeDeliveryThreshold: String(freeDeliveryThreshold),
    sameDayEnabled: sameDayEnabled !== false,
    sameDayCutoffTime: String(sameDayCutoffTime || "16:00"),
    sameDayNotice: String(sameDayNotice || ""),
  });
  const [zoneRows, setZoneRows] = useState(() => buildZoneRows(serviceZoneFees || serviceZones, deliveryFee));

  useEffect(() => {
    setForm({
      deliveryFee: String(deliveryFee),
      freeDeliveryThreshold: String(freeDeliveryThreshold),
      sameDayEnabled: sameDayEnabled !== false,
      sameDayCutoffTime: String(sameDayCutoffTime || "16:00"),
      sameDayNotice: String(sameDayNotice || ""),
    });
    setZoneRows(buildZoneRows(serviceZoneFees || serviceZones, deliveryFee));
    setExpandedZones({});
    setError("");
    setOk("");
  }, [deliveryFee, freeDeliveryThreshold, sameDayEnabled, sameDayCutoffTime, serviceZones, serviceZoneFees, sameDayNotice]);

  const disabled = saving || isPending;

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleZone = (index) => {
    setExpandedZones((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const setAllZonesExpanded = (open) => {
    setExpandedZones(
      zoneRows.reduce((acc, _zone, index) => {
        acc[index] = open;
        return acc;
      }, {})
    );
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    const deliveryFeeNumber = Number(form.deliveryFee);
    const freeDeliveryThresholdNumber = Number(form.freeDeliveryThreshold);
    if (!Number.isFinite(deliveryFeeNumber) || deliveryFeeNumber < 0) {
      setError("Enter a valid delivery fee.");
      return;
    }
    if (!Number.isFinite(freeDeliveryThresholdNumber) || freeDeliveryThresholdNumber < 0) {
      setError("Enter a valid free-delivery threshold.");
      return;
    }

    if (!zoneRows.length) {
      setError("Enter at least one service zone fee.");
      return;
    }

    const zonesPayload = [];
    for (const zone of zoneRows) {
      const name = String(zone.name || "").trim();
      if (!name) {
        setError("Each service zone must have a name.");
        return;
      }
      const feeNumber = Number(zone.fee);
      if (!Number.isFinite(feeNumber) || feeNumber < 0) {
        setError(`Enter a valid fee for ${name}.`);
        return;
      }
      const subzones = [];
      const parsedSubzones = parseSubzoneLines(zone.subzonesText);
      for (const subzone of parsedSubzones) {
        const subName = String(subzone.name || "").trim();
        if (!subName) continue;
        const subFeeNumber = Number(subzone.fee);
        if (!Number.isFinite(subFeeNumber) || subFeeNumber < 0) {
          setError(`Enter a valid subzone fee for ${subName} in ${name}.`);
          return;
        }
        subzones.push({ name: subName, fee: Math.round(subFeeNumber) });
      }
      zonesPayload.push({ name, fee: Math.round(feeNumber), subzones });
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/delivery-settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delivery_fee: Math.round(deliveryFeeNumber),
          free_delivery_threshold: Math.round(freeDeliveryThresholdNumber),
          same_day_enabled: form.sameDayEnabled,
          same_day_cutoff_time: String(form.sameDayCutoffTime || "").trim(),
          service_zones: zonesPayload.map((zone) => zone.name),
          service_zone_fees: zonesPayload,
          same_day_notice: String(form.sameDayNotice || "").trim() || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }

      setOk("Delivery settings updated.");
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Default Delivery Fee</span>
          <input
            type="number"
            min="0"
            step="1"
            value={form.deliveryFee}
            onChange={(event) => updateField("deliveryFee", event.target.value)}
            disabled={disabled}
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Free Delivery Threshold</span>
          <input
            type="number"
            min="0"
            step="1"
            value={form.freeDeliveryThreshold}
            onChange={(event) => updateField("freeDeliveryThreshold", event.target.value)}
            disabled={disabled}
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Same-Day Cutoff</span>
          <input
            type="time"
            value={form.sameDayCutoffTime}
            onChange={(event) => updateField("sameDayCutoffTime", event.target.value)}
            disabled={disabled}
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32, alignSelf: "end" }}>
          <input
            type="checkbox"
            checked={form.sameDayEnabled}
            onChange={(event) => updateField("sameDayEnabled", event.target.checked)}
            disabled={disabled}
          />
          <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 600 }}>Same-day enabled</span>
        </label>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={labelStyle}>Service Zone Pricing</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => setAllZonesExpanded(true)} disabled={disabled} style={smallButtonStyle}>
              Expand all
            </button>
            <button type="button" onClick={() => setAllZonesExpanded(false)} disabled={disabled} style={smallButtonStyle}>
              Collapse all
            </button>
          </div>
        </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {zoneRows.map((zone, index) => {
              const subzoneCount = getSubzoneCount(zone.subzonesText);
              return (
                <div key={`${zone.name}-${index}`} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 8, alignItems: "center" }}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 600 }}>{zone.name}</span>
                      <span style={{ color: "#64748b", fontSize: 11 }}>
                        {subzoneCount} subzone{subzoneCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={zone.fee}
                      onChange={(event) =>
                        setZoneRows((prev) =>
                          prev.map((row, rowIndex) => (rowIndex === index ? { ...row, fee: event.target.value } : row))
                        )
                      }
                      disabled={disabled}
                      style={fieldStyle}
                    />
                    <button
                      type="button"
                      onClick={() => toggleZone(index)}
                      disabled={disabled}
                      aria-expanded={Boolean(expandedZones[index])}
                      aria-controls={`service-zone-subzones-${index}`}
                      style={smallButtonStyle}
                    >
                      {expandedZones[index] ? "Hide" : "Edit"}
                    </button>
                  </div>
                  {expandedZones[index] ? (
                    <textarea
                      id={`service-zone-subzones-${index}`}
                      value={zone.subzonesText}
                      onChange={(event) =>
                        setZoneRows((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, subzonesText: event.target.value } : row
                          )
                        )
                      }
                      disabled={disabled}
                      placeholder="Subzone | Fee (one per line)"
                      style={{ ...textAreaStyle, minHeight: 64 }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={labelStyle}>Same-Day Notice</span>
        <textarea
          value={form.sameDayNotice}
          onChange={(event) => updateField("sameDayNotice", event.target.value)}
          disabled={disabled}
          placeholder="Optional custom note shown to customers about same-day delivery."
          style={textAreaStyle}
        />
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
          {disabled ? "Saving..." : "Save Delivery Settings"}
        </button>
        {error ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span> : null}
        {!error && ok ? <span style={{ color: "#166534", fontSize: 12 }}>{ok}</span> : null}
      </div>
    </form>
  );
}
