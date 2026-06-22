"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const toInputValue = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : "";
};

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
  price = 0,
  oldPrice = null,
  stockCount = null,
  variantActive = true,
  showSeason = true,
  showPrice = true,
  showStock = false,
  showAvailability = false,
}) {
  const router = useRouter();
  const initialSeason = inSeason ? "in" : "out";
  const initialPrice = toInputValue(price);
  const initialOldPrice = oldPrice == null ? "" : toInputValue(oldPrice);
  const initialStock = stockCount == null ? "" : toInputValue(stockCount);
  const initialAvailability = variantActive ? "active" : "inactive";

  const [seasonValue, setSeasonValue] = useState(initialSeason);
  const [priceValue, setPriceValue] = useState(initialPrice);
  const [oldPriceValue, setOldPriceValue] = useState(initialOldPrice);
  const [stockValue, setStockValue] = useState(initialStock);
  const [availabilityValue, setAvailabilityValue] = useState(initialAvailability);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  const disabled = isSaving || isPending;

  useEffect(() => {
    setSeasonValue(initialSeason);
    setPriceValue(initialPrice);
    setOldPriceValue(initialOldPrice);
    setStockValue(initialStock);
    setAvailabilityValue(initialAvailability);
    setError("");
  }, [initialAvailability, initialOldPrice, initialPrice, initialSeason, initialStock]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOk("");

    const requestBody = { product_id: productId };
    let clearedOldPrice = false;
    let nextPrice = null;
    let nextOldPrice = null;

    if (showPrice) {
      if (!variantId) {
        setError("Missing variant id.");
        return;
      }

      const trimmedPrice = String(priceValue || "").trim();
      const trimmedOldPrice = String(oldPriceValue || "").trim();
      if (!trimmedPrice) {
        setError("Enter a price.");
        return;
      }

      nextPrice = Number(trimmedPrice);
      if (!Number.isFinite(nextPrice) || nextPrice < 0) {
        setError("Price must be 0 or more.");
        return;
      }

      const rawOldPrice = trimmedOldPrice ? Number(trimmedOldPrice) : null;
      if (trimmedOldPrice && (!Number.isFinite(rawOldPrice) || rawOldPrice < 0)) {
        setError("Old price must be empty or 0 or more.");
        return;
      }

      clearedOldPrice = rawOldPrice != null && rawOldPrice < nextPrice;
      nextOldPrice = clearedOldPrice ? null : rawOldPrice;
      if (clearedOldPrice) {
        setOldPriceValue("");
      }

      requestBody.variant_id = variantId;
      requestBody.price = nextPrice;
      requestBody.old_price = nextOldPrice;
    }

    let nextStock = null;
    let stockChanged = false;
    if (showStock) {
      if (!variantId) {
        setError("Missing variant id.");
        return;
      }

      const trimmedStock = String(stockValue || "").trim();
      if (!trimmedStock && initialStock) {
        setError("Enter a stock count.");
        return;
      }

      if (trimmedStock) {
        nextStock = Number(trimmedStock);
        if (!Number.isInteger(nextStock) || nextStock < 0) {
          setError("Stock must be a whole number, 0 or more.");
          return;
        }

        stockChanged = String(nextStock) !== initialStock;
        if (stockChanged) {
          requestBody.variant_id = variantId;
          requestBody.stock_count = nextStock;
        }
      }
    }

    const nextInSeason = showSeason ? seasonValue === "in" : null;
    const nextVariantActive = showAvailability ? availabilityValue === "active" : null;
    const seasonChanged = showSeason && nextInSeason !== (inSeason === true);
    const priceChanged = showPrice && String(nextPrice) !== initialPrice;
    const oldPriceChanged = showPrice && String(nextOldPrice ?? "") !== initialOldPrice;
    const availabilityChanged = showAvailability && nextVariantActive !== (variantActive === true);

    if (!seasonChanged && !priceChanged && !oldPriceChanged && !stockChanged && !availabilityChanged) {
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

      const oldPriceCleared = Boolean(payload?.normalized?.oldPriceCleared || clearedOldPrice);
      if (oldPriceCleared) {
        setOk("Saved. Old price cleared because it was below current price.");
      } else if (showSeason && !showPrice && !showStock && !showAvailability) {
        setOk("Season updated.");
      } else if ((showPrice || showStock || showAvailability) && !showSeason) {
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

      {showPrice ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Price</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={priceValue}
            onChange={(event) => setPriceValue(event.target.value)}
            disabled={disabled}
            aria-label={`Price for ${productName} ${variantName}`}
            placeholder="0"
            style={{ width: 92, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          />
        </label>
      ) : null}

      {showStock ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Stock</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={stockValue}
            onChange={(event) => setStockValue(event.target.value)}
            disabled={disabled}
            aria-label={`Stock for ${productName} ${variantName}`}
            placeholder="0"
            style={{ width: 92, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
          />
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

      {showPrice ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={fieldLabelStyle}>Old Price</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={oldPriceValue}
            onChange={(event) => setOldPriceValue(event.target.value)}
            disabled={disabled}
            aria-label={`Old price for ${productName} ${variantName}`}
            placeholder="Optional"
            style={{ width: 92, border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 12 }}
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
