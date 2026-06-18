"use client";

import { useEffect, useMemo, useState } from "react";

const RATINGS_STORAGE_KEY = "mealkit_bundle_plan_ratings";
const DEFAULT_BREAKDOWN = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

const BASELINE_SUMMARIES = {
  "bundle-smart-starter-pack": {
    average: 4.5,
    totalRatings: 26,
    breakdown: { 5: 16, 4: 8, 3: 1, 2: 1, 1: 0 },
  },
  "bundle-family-essentials": {
    average: 4.6,
    totalRatings: 31,
    breakdown: { 5: 21, 4: 8, 3: 1, 2: 1, 1: 0 },
  },
  "bundle-family-soup-pack": {
    average: 4.4,
    totalRatings: 18,
    breakdown: { 5: 10, 4: 6, 3: 1, 2: 1, 1: 0 },
  },
  "bundle-premium-kitchen": {
    average: 4.7,
    totalRatings: 14,
    breakdown: { 5: 10, 4: 3, 3: 1, 2: 0, 1: 0 },
  },
  "bundle-value-saver-pack": {
    average: 4.5,
    totalRatings: 29,
    breakdown: { 5: 19, 4: 8, 3: 1, 2: 1, 1: 0 },
  },
};

const clampRating = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
};

const buildStars = (value, hoverValue) => {
  const safeValue = Math.max(0, Math.min(Number(value) || 0, 5));
  const activeValue = hoverValue != null ? hoverValue : safeValue;
  return Array.from({ length: 5 }, (_, index) => index + 1).map((star) => ({
    value: star,
    isActive: star <= activeValue,
  }));
};

const getBaselineSummary = (planId) => {
  const fallback = { average: 0, totalRatings: 0, breakdown: { ...DEFAULT_BREAKDOWN } };
  if (!planId) return fallback;

  const summary = BASELINE_SUMMARIES[String(planId)] || fallback;
  return {
    average: Number(summary.average) || 0,
    totalRatings: Number(summary.totalRatings) || 0,
    breakdown: { ...DEFAULT_BREAKDOWN, ...(summary.breakdown || {}) },
  };
};

const applyUserRatingToSummary = (summary, previousRating, nextRating) => {
  const base = {
    average: Number(summary?.average) || 0,
    totalRatings: Number(summary?.totalRatings) || 0,
    breakdown: { ...DEFAULT_BREAKDOWN, ...(summary?.breakdown || {}) },
  };

  let totalRatings = Math.max(0, base.totalRatings);
  let totalScore = base.average * totalRatings;
  const breakdown = { ...base.breakdown };

  const previous = clampRating(previousRating);
  const next = clampRating(nextRating);

  if (previous) {
    breakdown[previous] = Math.max(0, Number(breakdown[previous] || 0) - 1);
    totalRatings = Math.max(0, totalRatings - 1);
    totalScore = Math.max(0, totalScore - previous);
  }

  if (next) {
    breakdown[next] = Number(breakdown[next] || 0) + 1;
    totalRatings += 1;
    totalScore += next;
  }

  return {
    average: totalRatings ? Number((totalScore / totalRatings).toFixed(1)) : 0,
    totalRatings,
    breakdown,
  };
};

const readStoredRatings = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(RATINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const readStoredRating = (planId) => {
  if (!planId) return null;
  const all = readStoredRatings();
  return clampRating(all?.[String(planId)]);
};

const writeStoredRating = (planId, rating) => {
  if (typeof window === "undefined" || !planId) return;
  const safeRating = clampRating(rating);
  if (!safeRating) return;
  const all = readStoredRatings();
  all[String(planId)] = safeRating;
  window.localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(all));
};

function RatingBreakdown({ breakdown, totalRatings }) {
  const scale = [5, 4, 3, 2, 1];

  return (
    <ul className="product-rating-breakdown" aria-label="Rating distribution">
      {scale.map((stars) => {
        const count = Number(breakdown?.[stars]) || 0;
        const percent = totalRatings ? Math.round((count / totalRatings) * 100) : 0;

        return (
          <li key={stars}>
            <span className="product-rating-breakdown__label">{stars}</span>
            <div className="product-rating-breakdown__bar" aria-hidden="true">
              <span className="product-rating-breakdown__bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="product-rating-breakdown__count">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function BundlePlanRatingSection({ planId, planName }) {
  const baselineSummary = useMemo(() => getBaselineSummary(planId), [planId]);
  const [summary, setSummary] = useState(baselineSummary);
  const [userRating, setUserRating] = useState(null);
  const [hoverRating, setHoverRating] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const storedRating = readStoredRating(planId);
    setUserRating(storedRating);
    setSummary(applyUserRatingToSummary(baselineSummary, null, storedRating));
    setStatus("idle");
    setMessage("");
  }, [baselineSummary, planId]);

  const stars = useMemo(() => buildStars(userRating, hoverRating), [userRating, hoverRating]);

  const handleRate = (nextRating) => {
    const safeRating = clampRating(nextRating);
    if (!safeRating) return;

    setStatus("saving");
    setMessage("");

    try {
      writeStoredRating(planId, safeRating);
      setSummary((currentSummary) => applyUserRatingToSummary(currentSummary, userRating, safeRating));
      setUserRating(safeRating);
      setStatus("saved");
      setMessage("Thanks for rating this pack.");
    } catch {
      setStatus("error");
      setMessage("Unable to save your rating right now.");
    }
  };

  return (
    <section className="product-detail-section" aria-labelledby="bundle-feedback-heading">
      <div className="product-feedback__header">
        <h2 id="bundle-feedback-heading">Customer ratings</h2>
      </div>

      <div className="product-feedback">
        <div className="product-feedback__summary" aria-label="Average rating">
          <div className="product-feedback__score">{summary.average.toFixed(1)}/5</div>
          <span className="product-star-rating" aria-hidden="true">
            {buildStars(summary.average).map((star) => (
              <i
                key={`summary-${star.value}`}
                className={`${star.isActive ? "fa-solid" : "fa-regular"} fa-star`}
              />
            ))}
          </span>
          <p>{summary.totalRatings} verified ratings</p>
          <RatingBreakdown breakdown={summary.breakdown} totalRatings={summary.totalRatings} />
        </div>

        <div className="product-feedback__reviews">
          <div className="product-rating-input" role="radiogroup" aria-label={`Rate ${planName}`}>
            {stars.map((star) => (
              <button
                key={star.value}
                type="button"
                className={`product-rating-star${star.isActive ? " is-active" : ""}`}
                aria-pressed={userRating === star.value}
                onMouseEnter={() => setHoverRating(star.value)}
                onMouseLeave={() => setHoverRating(null)}
                onFocus={() => setHoverRating(star.value)}
                onBlur={() => setHoverRating(null)}
                onClick={() => handleRate(star.value)}
                disabled={status === "saving"}
              >
                <i className="fa-solid fa-star" aria-hidden="true" />
                <span className="sr-only">{`${star.value} star${star.value > 1 ? "s" : ""}`}</span>
              </button>
            ))}
          </div>
          <div className="product-rating-meta">
            {userRating ? (
              <p>Your rating: {userRating} / 5</p>
            ) : (
              <p>Tap a star to rate this pack.</p>
            )}
            <p className="product-feedback__disclaimer">
              Ratings help us improve pack combinations and quality over time.
            </p>
            {message ? (
              <p className={`product-rating-message product-rating-message--${status}`}>{message}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
