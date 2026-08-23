"use client";

import {
  SELECTION_MODE_FLEXIBLE,
  normalizeSizePreference,
} from "@/lib/commerce-options";

const DEFAULT_VARIATION_NOTE =
  "Fresh produce naturally varies. Size, shape, weight and number of pieces may differ depending on what is available at the farm or market.";

const OPTIONS = Object.freeze([
  {
    value: "best_available",
    label: "Best available",
    description: "We choose the best suitable size available.",
    recommended: true,
  },
  { value: "smaller", label: "Smaller", description: "Prefer smaller pieces." },
  { value: "medium", label: "Medium", description: "Prefer medium-sized pieces." },
  { value: "larger", label: "Larger", description: "Prefer larger pieces." },
]);

export default function SizePreferencePicker({
  value,
  onChange,
  variationNote,
  compact = false,
}) {
  const selected =
    normalizeSizePreference(value, SELECTION_MODE_FLEXIBLE) || "best_available";

  return (
    <fieldset className={`size-preference-picker${compact ? " is-compact" : ""}`}>
      <legend className="size-preference-picker__legend">Preferred size</legend>
      <p className="size-preference-picker__intro">
        Choose what you prefer. Your preference does not change the price, quantity, or value you pay for.
      </p>

      <div className="size-preference-picker__options">
        {OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`size-preference-picker__option${isSelected ? " is-selected" : ""}${option.recommended ? " is-recommended" : ""}`}
              onClick={() => onChange?.(option.value)}
              aria-pressed={isSelected}
            >
              <span className="size-preference-picker__option-copy">
                <span className="size-preference-picker__option-title">
                  {option.label}
                  {option.recommended ? (
                    <span className="size-preference-picker__recommended">Recommended</span>
                  ) : null}
                </span>
                <span className="size-preference-picker__option-description">
                  {option.description}
                </span>
              </span>
              <span className="size-preference-picker__indicator" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <p className="size-preference-picker__note">
        {String(variationNote || "").trim() || DEFAULT_VARIATION_NOTE}
      </p>
      <p className="size-preference-picker__fallback">
        We’ll aim to match your preference. If it isn’t available, we’ll use the closest suitable size while preserving the quantity or value represented by the option you paid for.
      </p>
    </fieldset>
  );
}
