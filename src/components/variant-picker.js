"use client";

import { useEffect, useMemo, useState } from "react";
import { formatProductPrice, resolveStockClass } from "@/lib/catalogue";

const normaliseText = (value) => (value == null ? "" : String(value).trim());
const normaliseKey = (value) => normaliseText(value).toLowerCase();

const getRipenessLabel = (variant) => normaliseText(variant?.ripeness);
const getSizeLabel = (variant) =>
  normaliseText(
    variant?.sizeLabel ||
      variant?.size ||
      variant?.packaging ||
      variant?.name ||
      variant?.variationId
  );

const RANGE_PATTERN = /\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/;

const getRangeMidpoint = (label) => {
  const match = normaliseText(label).match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return (low + high) / 2;
};

const buildSizeDisplayLabels = (options) => {
  if (!Array.isArray(options) || options.length < 2 || options.length > 3) return new Map();
  if (!options.every((option) => RANGE_PATTERN.test(option.label))) return new Map();
  const sorted = [...options]
    .map((option) => ({ ...option, midpoint: getRangeMidpoint(option.label) }))
    .filter((option) => Number.isFinite(option.midpoint))
    .sort((a, b) => a.midpoint - b.midpoint);
  if (sorted.length !== options.length) return new Map();
  const labels = sorted.length === 2 ? ["Small", "Large"] : ["Small", "Medium", "Large"];
  return new Map(sorted.map((option, index) => [option.key, labels[index]]));
};

const buildOptions = (list, getLabel, { simplifyRanges = false } = {}) => {
  const seen = new Set();
  const options = [];

  list.forEach((variant) => {
    const label = getLabel(variant);
    if (!label) return;
    const key = normaliseKey(label);
    if (seen.has(key)) return;
    seen.add(key);
    options.push({ label, key });
  });

  if (!simplifyRanges) return options;
  const displayLabels = buildSizeDisplayLabels(options);
  if (!displayLabels.size) return options;
  return options.map((option) => ({
    ...option,
    label: displayLabels.get(option.key) || option.label,
  }));
};

const getStockValue = (variant) => {
  const stockCount = Number(variant?.stockCount);
  if (Number.isFinite(stockCount)) return stockCount;
  return variant?.stock;
};

const isVariantInactive = (variant) => {
  if (!variant || typeof variant !== "object") return true;
  if (variant.isSelectable === false || variant.is_active === false || variant.isActive === false) return true;
  const stockClass = resolveStockClass(getStockValue(variant));
  return stockClass === "is-unavailable";
};

const pickBySizeLabel = (list, label) => {
  const key = normaliseKey(label);
  if (!key) return null;
  const matches = list.filter((variant) => normaliseKey(getSizeLabel(variant)) === key);
  if (!matches.length) return null;
  return matches.find((variant) => !isVariantInactive(variant)) || matches[0];
};

const pickFirstAvailable = (list) => list.find((variant) => !isVariantInactive(variant)) || list[0] || null;

export default function VariantPicker({ variations = [], selectedId, onChange }) {
  const safeVariations = useMemo(() => (Array.isArray(variations) ? variations : []), [variations]);
  const selectedVariant = useMemo(
    () =>
      safeVariations.find(
        (variant) =>
          String(variant?.variationId || variant?.id || "") === String(selectedId || "")
      ),
    [safeVariations, selectedId]
  );

  const [selectedRipeness, setSelectedRipeness] = useState("");
  const [selectedSizeLabel, setSelectedSizeLabel] = useState("");

  useEffect(() => {
    const base = selectedVariant || safeVariations[0] || null;
    if (!base) {
      setSelectedRipeness("");
      setSelectedSizeLabel("");
      return;
    }
    setSelectedRipeness(getRipenessLabel(base));
    setSelectedSizeLabel(getSizeLabel(base));
  }, [selectedVariant, safeVariations]);

  const ripenessOptions = useMemo(() => buildOptions(safeVariations, getRipenessLabel), [safeVariations]);
  const hasRipenessStep = ripenessOptions.length > 1;

  const filteredByRipeness = useMemo(() => {
    if (!hasRipenessStep) return safeVariations;
    const key = normaliseKey(selectedRipeness);
    if (!key) return [];
    return safeVariations.filter((variant) => normaliseKey(getRipenessLabel(variant)) === key);
  }, [safeVariations, hasRipenessStep, selectedRipeness]);

  const sizeOptions = useMemo(
    () => buildOptions(filteredByRipeness, getSizeLabel, { simplifyRanges: true }),
    [filteredByRipeness]
  );

  const handleRipenessSelect = (label) => {
    const nextRipeness = normaliseText(label);
    setSelectedRipeness(nextRipeness);

    const nextList = safeVariations.filter(
      (variant) => normaliseKey(getRipenessLabel(variant)) === normaliseKey(nextRipeness)
    );
    const preferred =
      pickBySizeLabel(nextList, selectedSizeLabel) || pickFirstAvailable(nextList);
    const nextSize = preferred ? getSizeLabel(preferred) : "";
    setSelectedSizeLabel(nextSize);
    if (preferred && onChange) onChange(preferred);
  };

  const handleSizeSelect = (key) => {
    const match =
      filteredByRipeness.find(
        (variant) => normaliseKey(getSizeLabel(variant)) === key && !isVariantInactive(variant)
      ) ||
      filteredByRipeness.find((variant) => normaliseKey(getSizeLabel(variant)) === key);
    const nextLabel = match ? getSizeLabel(match) : "";
    setSelectedSizeLabel(nextLabel);
    if (match && onChange) onChange(match);
  };

  if (!safeVariations.length) return null;

  const showSizeOptions = !hasRipenessStep || Boolean(selectedRipeness);

  return (
    <div className="product-variant-picker">
      {hasRipenessStep ? (
        <div className="product-variant-picker__section">
          <p className="product-variant-picker__label">Ripeness</p>
          <div className="product-variant-picker__options" role="list">
            {ripenessOptions.map((option) => {
              const optionVariants = safeVariations.filter(
                (variant) => normaliseKey(getRipenessLabel(variant)) === option.key
              );
              const disabled = optionVariants.length ? optionVariants.every(isVariantInactive) : false;
              const isActive = normaliseKey(selectedRipeness) === option.key;
              const stateClass = disabled ? " is-unavailable" : " is-available";
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`product-variant-picker__option${stateClass}${isActive ? " is-active" : ""}`.trim()}
                  onClick={() => handleRipenessSelect(option.label)}
                  aria-pressed={isActive}
                  disabled={disabled}
                >
                  <span className="product-variant-picker__option-main">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="product-variant-picker__section">
        <p className="product-variant-picker__label">Size</p>
        {showSizeOptions ? (
          <div className="product-variant-picker__options" role="list">
            {sizeOptions.map((option) => {
              const variant =
                filteredByRipeness.find(
                  (entry) =>
                    normaliseKey(getSizeLabel(entry)) === option.key && !isVariantInactive(entry)
                ) ||
                filteredByRipeness.find(
                  (entry) => normaliseKey(getSizeLabel(entry)) === option.key
                );
              const disabled = !variant || isVariantInactive(variant);
              const isActive = normaliseKey(selectedSizeLabel) === option.key;
              const stateClass = disabled ? " is-unavailable" : " is-available";
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`product-variant-picker__option${stateClass}${isActive ? " is-active" : ""}`.trim()}
                  onClick={() => handleSizeSelect(option.key)}
                  aria-pressed={isActive}
                  disabled={disabled}
                >
                  <span className="product-variant-picker__option-main">{option.label}</span>
                  <span className="product-variant-picker__option-price">
                    {formatProductPrice(variant?.price, variant?.unit)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
