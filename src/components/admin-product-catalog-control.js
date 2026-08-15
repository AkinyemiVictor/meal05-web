"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const toInputValue = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : "";
};

const toNullableNumber = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
};

const normalizeText = (value) => String(value || "").trim();

const fieldLabelStyle = {
  color: "#475569",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

export default function AdminProductCatalogControl({
  productId,
  productName,
  variantId,
  variantName,
  inSeason = true,
  variantActive = true,
  purchaseMode = "fixed",
  minQuantity = null,
  maxQuantity = null,
  stepQuantity = null,
  baseUnit = "",
  baseQuantity = null,
  showSeason = true,
  showAvailability = false,
  showPurchaseRules = false,
}) {
  const router = useRouter();
  const initialSeason = inSeason ? "in" : "out";
  const initialAvailability = variantActive ? "active" : "inactive";
  const initialPurchaseMode = purchaseMode === "loose" ? "loose" : "fixed";
  const initialMinQuantity = minQuantity == null ? "" : toInputValue(minQuantity);
  const initialMaxQuantity = maxQuantity == null ? "" : toInputValue(maxQuantity);
  const initialStepQuantity = stepQuantity == null ? "" : toInputValue(stepQuantity);
  const initialBaseUnit = normalizeText(baseUnit);
  const initialBaseQuantity = baseQuantity == null ? "" : toInputValue(baseQuantity);

  const [seasonValue, setSeasonValue] = useState(initialSeason);
  const [availabilityValue, setAvailabilityValue] = useState(initialAvailability);
  const [purchaseModeValue, setPurchaseModeValue] = useState(initialPurchaseMode);
  const [minQuantityValue, setMinQuantityValue] = useState(initialMinQuantity);
  const [maxQuantityValue, setMaxQuantityValue] = useState(initialMaxQuantity);
  const [stepQuantityValue, setStepQuantityValue] = useState(initialStepQuantity);
  const [baseUnitValue, setBaseUnitValue] = useState(initialBaseUnit);
  const [baseQuantityValue, setBaseQuantityValue] = useState(initialBaseQuantity);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  const disabled = isSaving || isPending;

  useEffect(() => {
    setSeasonValue(initialSeason);
    setAvailabilityValue(initialAvailability);
    setPurchaseModeValue(initialPurchaseMode);
    setMinQuantityValue(initialMinQuantity);
    setMaxQuantityValue(initialMaxQuantity);
    setStepQuantityValue(initialStepQuantity);
    setBaseUnitValue(initialBaseUnit);
    setBaseQuantityValue(initialBaseQuantity);
    setError("");
  }, [
    initialAvailability,
    initialBaseQuantity,
    initialBaseUnit,
    initialMaxQuantity,
    initialMinQuantity,
    initialPurchaseMode,
    initialSeason,
    initialStepQuantity,
  ]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    const requestBody = { product_id: productId };
    let purchaseRulesChanged = false;
    if (showPurchaseRules) {
      if (!variantId) {
        setError("Missing variant id.");
        return;
      }

      const nextPurchaseMode = purchaseModeValue === "loose" ? "loose" : "fixed";
      const nextMinQuantity = toNullableNumber(minQuantityValue);
      const nextMaxQuantity = toNullableNumber(maxQuantityValue);
      const nextStepQuantity = toNullableNumber(stepQuantityValue);
      const nextBaseUnit = normalizeText(baseUnitValue);
      const nextBaseQuantity = toNullableNumber(baseQuantityValue);

      if (normalizeText(minQuantityValue) && (nextMinQuantity == null || nextMinQuantity <= 0)) {
        setError("Minimum quantity must be greater than 0.");
        return;
      }
      if (normalizeText(maxQuantityValue) && (nextMaxQuantity == null || nextMaxQuantity <= 0)) {
        setError("Maximum quantity must be greater than 0.");
        return;
      }
      if (normalizeText(stepQuantityValue) && (nextStepQuantity == null || nextStepQuantity <= 0)) {
        setError("Step quantity must be greater than 0.");
        return;
      }
      if (normalizeText(baseQuantityValue) && (nextBaseQuantity == null || nextBaseQuantity <= 0)) {
        setError("Base quantity must be greater than 0.");
        return;
      }
      if (nextMinQuantity != null && nextMaxQuantity != null && nextMinQuantity > nextMaxQuantity) {
        setError("Minimum quantity cannot be greater than maximum quantity.");
        return;
      }

      const minChanged = String(nextMinQuantity ?? "") !== initialMinQuantity;
      const maxChanged = String(nextMaxQuantity ?? "") !== initialMaxQuantity;
      const stepChanged = String(nextStepQuantity ?? "") !== initialStepQuantity;
      const baseUnitChanged = nextBaseUnit !== initialBaseUnit;
      const baseQuantityChanged = String(nextBaseQuantity ?? "") !== initialBaseQuantity;
      purchaseRulesChanged =
        nextPurchaseMode !== initialPurchaseMode ||
        minChanged ||
        maxChanged ||
        stepChanged ||
        baseUnitChanged ||
        baseQuantityChanged;

      if (purchaseRulesChanged) {
        requestBody.variant_id = variantId;
        requestBody.purchase_mode = nextPurchaseMode;
        requestBody.min_quantity = nextMinQuantity;
        requestBody.max_quantity = nextMaxQuantity;
        requestBody.step_quantity = nextStepQuantity;
        requestBody.base_unit = nextBaseUnit || null;
        requestBody.base_quantity = nextBaseQuantity;
      }
    }

    const nextInSeason = showSeason ? seasonValue === "in" : null;
    const nextVariantActive = showAvailability ? availabilityValue === "active" : null;
    const seasonChanged = showSeason && nextInSeason !== (inSeason === true);
    const availabilityChanged = showAvailability && nextVariantActive !== (variantActive === true);

    if (!seasonChanged && !availabilityChanged && !purchaseRulesChanged) {
      setError("No change selected.");
      return;
    }

    if (seasonChanged) {
      requestBody.in_season = nextInSeason;
    }
    if (availabilityChanged) {
      requestBody.variant_id = variantId;
      requestBody.variant_is_active = nextVariantActive;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/products/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || `Request failed (${response.status})`);
        return;
      }

      if (showSeason && !showAvailability && !showPurchaseRules) {
        setOk("Season updated.");
      } else if ((showAvailability || showPurchaseRules) && !showSeason) {
        setOk("Variant updated.");
      } else {
        setOk("Saved.");
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
      {showSeason ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Season</span>
          <select
            value={seasonValue}
            onChange={(event) => setSeasonValue(event.target.value)}
            disabled={disabled}
            aria-label={`Season for ${productName}`}
            style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          >
            <option value="in">In Season</option>
            <option value="out">Out Of Season</option>
          </select>
        </label>
      ) : null}

      {showAvailability ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Availability</span>
          <select
            value={availabilityValue}
            onChange={(event) => setAvailabilityValue(event.target.value)}
            disabled={disabled}
            aria-label={`Availability for ${productName} ${variantName}`}
            style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          >
            <option value="active">Available</option>
            <option value="inactive">Unavailable</option>
          </select>
        </label>
      ) : null}

      {showPurchaseRules ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Purchase</span>
          <select
            value={purchaseModeValue}
            onChange={(event) => setPurchaseModeValue(event.target.value)}
            disabled={disabled}
            aria-label={`Purchase mode for ${productName} ${variantName}`}
            style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          >
            <option value="fixed">Fixed</option>
            <option value="loose">Loose</option>
          </select>
        </label>
      ) : null}

      {showPurchaseRules ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Min Qty</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={minQuantityValue}
            onChange={(event) => setMinQuantityValue(event.target.value)}
            disabled={disabled}
            aria-label={`Minimum quantity for ${productName} ${variantName}`}
            placeholder="1"
            style={{ width: 76, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          />
        </label>
      ) : null}

      {showPurchaseRules ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Max Qty</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={maxQuantityValue}
            onChange={(event) => setMaxQuantityValue(event.target.value)}
            disabled={disabled}
            aria-label={`Maximum quantity for ${productName} ${variantName}`}
            placeholder="None"
            style={{ width: 76, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          />
        </label>
      ) : null}

      {showPurchaseRules ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Step Qty</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={stepQuantityValue}
            onChange={(event) => setStepQuantityValue(event.target.value)}
            disabled={disabled}
            aria-label={`Step quantity for ${productName} ${variantName}`}
            placeholder="1"
            style={{ width: 76, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          />
        </label>
      ) : null}

      {showPurchaseRules ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Base Unit</span>
          <input
            type="text"
            value={baseUnitValue}
            onChange={(event) => setBaseUnitValue(event.target.value)}
            disabled={disabled}
            aria-label={`Base unit for ${productName} ${variantName}`}
            placeholder="piece"
            style={{ width: 84, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          />
        </label>
      ) : null}

      {showPurchaseRules ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Base Qty</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={baseQuantityValue}
            onChange={(event) => setBaseQuantityValue(event.target.value)}
            disabled={disabled}
            aria-label={`Base quantity for ${productName} ${variantName}`}
            placeholder="1"
            style={{ width: 76, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          />
        </label>
      ) : null}

      <button
        type="submit"
        disabled={disabled}
        style={{
          border: "1px solid #0f172a",
          borderRadius: 6,
          background: "#0f172a",
          color: "#ffffff",
          padding: "5px 8px",
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
