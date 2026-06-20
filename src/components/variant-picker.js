"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveStockClass } from "@/lib/catalogue";

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

const buildOptions = (list, getLabel) => {
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

  return options;
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
  return stockClass === "is-unavailable" || stockClass === "is-limited";
};

const pickBySizeLabel = (list, label) => {
  const key = normaliseKey(label);
  if (!key) return null;
  const matches = list.filter((variant) => normaliseKey(getSizeLabel(variant)) === key);
  if (!matches.length) return null;
  return matches.find((variant) => !isVariantInactive(variant)) || matches[0];
};

const pickFirstAvailable = (list) => list.find((variant) => !isVariantInactive(variant)) || list[0] || null;

const SIZE_TOKEN_PATTERN = /(kg|g|gram|grams|ml|l|litre|liter|size|small|medium|large|xl|xxl|\d)/i;
const RANGE_PATTERN = /\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/;

const inferSizePrompt = (options, { hasRipenessStep = false } = {}) => {
  const labels = (Array.isArray(options) ? options : [])
    .map((option) => normaliseText(option?.label))
    .filter(Boolean);

  const hasRangeValues = labels.some((label) => RANGE_PATTERN.test(label));
  const hasSizeSignals = labels.some((label) => SIZE_TOKEN_PATTERN.test(label));

  if (hasRangeValues || hasSizeSignals) {
    return "Pick size range";
  }

  return hasRipenessStep ? "Pick size option" : "Pick an option";
};

const getSectionTitle = ({ kind, hasRipenessStep = false, options = [] }) => {
  if (kind === "ripeness") return "Ripeness Option";

  const labels = (Array.isArray(options) ? options : [])
    .map((option) => normaliseText(option?.label))
    .filter(Boolean);
  const hasRangeValues = labels.some((label) => RANGE_PATTERN.test(label));
  const hasSizeSignals = labels.some((label) => SIZE_TOKEN_PATTERN.test(label));

  if (hasRangeValues) return "Pack Range";
  if (hasSizeSignals) return "Unit Option";
  return hasRipenessStep ? "Item Option" : "Processing Option";
};

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

  const sizeOptions = useMemo(() => buildOptions(filteredByRipeness, getSizeLabel), [filteredByRipeness]);
  const sizePrompt = useMemo(
    () => inferSizePrompt(sizeOptions, { hasRipenessStep }),
    [sizeOptions, hasRipenessStep]
  );
  const ripenessHeading = useMemo(
    () => getSectionTitle({ kind: "ripeness", hasRipenessStep, options: ripenessOptions }),
    [hasRipenessStep, ripenessOptions]
  );
  const sizeHeading = useMemo(
    () => getSectionTitle({ kind: "size", hasRipenessStep, options: sizeOptions }),
    [hasRipenessStep, sizeOptions]
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

  const handleSizeSelect = (label) => {
    const nextLabel = normaliseText(label);
    setSelectedSizeLabel(nextLabel);
    const match = pickBySizeLabel(filteredByRipeness, nextLabel);
    if (match && onChange) onChange(match);
  };

  if (!safeVariations.length) return null;

  const showSizeOptions = !hasRipenessStep || Boolean(selectedRipeness);

  return (
    <div className="product-variant-picker">
      {hasRipenessStep ? (
        <div className="product-variant-picker__section">
          <p className="product-variant-picker__label">{ripenessHeading}</p>
          <div className="product-variant-picker__options" role="list">
            {ripenessOptions.map((option) => {
              const optionVariants = safeVariations.filter(
                (variant) => normaliseKey(getRipenessLabel(variant)) === option.key
              );
              const disabled = optionVariants.length ? optionVariants.every(isVariantInactive) : false;
              const isActive = normaliseKey(selectedRipeness) === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`product-variant-picker__option${isActive ? " is-active" : ""}`.trim()}
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
        <p className="product-variant-picker__label">{sizeHeading}</p>
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
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`product-variant-picker__option${isActive ? " is-active" : ""}`.trim()}
                  onClick={() => handleSizeSelect(option.label)}
                  aria-pressed={isActive}
                  disabled={disabled}
                >
                  <span className="product-variant-picker__option-main">{option.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="product-variant-picker__hint">
            {sizePrompt === "Pick size range" ? "Pick ripeness to view available size ranges." : "Pick ripeness to view the next option set."}
          </p>
        )}
      </div>
    </div>
  );
}
