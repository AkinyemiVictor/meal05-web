"use client";

import { SELECTION_MODE_FLEXIBLE, normalizeSizePreference } from "@/lib/commerce-options";

const OPTIONS = Object.freeze([
  { value: "best_available", label: "Best available" },
  { value: "smaller", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "larger", label: "Large" },
]);

export default function SizePreferencePicker({ value, onChange, compact = false }) {
  const selected = normalizeSizePreference(value, SELECTION_MODE_FLEXIBLE) || "best_available";

  return (
    <fieldset className={`size-preference-picker${compact ? " is-compact" : ""}`}>
      <legend className="size-preference-picker__legend">Piece size preference</legend>

      <div className="size-preference-picker__options">
        {OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`size-preference-picker__option${isSelected ? " is-selected" : ""}`}
              onClick={() => onChange?.(option.value)}
              aria-pressed={isSelected}
            >
              {isSelected ? <span className="size-preference-picker__check" aria-hidden="true">✓</span> : null}
              <span className="size-preference-picker__label">{option.label}</span>
            </button>
          );
        })}
      </div>

      <p className="size-preference-picker__note">
        <span className="size-preference-picker__info" aria-hidden="true">i</span>
        <span>We’ll try to match your preference. Fresh produce sizes may vary.</span>
      </p>
      <details className="size-preference-picker__details">
        <summary>How this works</summary>
        <p>
          Choose the piece size you prefer. If it isn’t available, we may send the closest available size. Your selected quantity or weight stays the same.
        </p>
      </details>
    </fieldset>
  );
}
