"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readStoredUser } from "@/lib/auth";
import { buildSignInHref } from "@/lib/auth-redirect";

const buildStars = (value, hoverValue) => {
  const safeValue = Math.max(0, Math.min(Number(value) || 0, 5));
  const activeValue = hoverValue != null ? hoverValue : safeValue;
  return Array.from({ length: 5 }, (_, index) => index + 1).map((star) => ({
    value: star,
    isActive: star <= activeValue,
  }));
};

export default function ProductRatingSection({ productId, productName }) {
  const pathname = usePathname();
  const [summary, setSummary] = useState({ average: 0, totalRatings: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  const [userRating, setUserRating] = useState(null);
  const [hoverRating, setHoverRating] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const isLoggedIn = Boolean(readStoredUser());
  const locationSearch = typeof window === "undefined" ? "" : window.location.search;
  const signInHref = useMemo(() => {
    const base = pathname || "/";
    return buildSignInHref({ tab: "login", next: `${base}${locationSearch}`, hash: "loginForm" });
  }, [pathname, locationSearch]);

  const fetchRatings = useCallback(async () => {
    if (!productId) return;
    try {
      const res = await fetch(`/api/ratings/${productId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        return;
      }
      setSummary({
        average: Number(data.average) || 0,
        totalRatings: Number(data.totalRatings) || 0,
        breakdown: data.breakdown || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      });
      setUserRating(Number(data.userRating) || null);
    } catch (error) {
      // Silently ignore rating fetch errors to avoid showing backend details.
    }
  }, [productId]);

  useEffect(() => {
    fetchRatings();
  }, [fetchRatings]);

  const stars = useMemo(() => buildStars(userRating, hoverRating), [userRating, hoverRating]);

  const handleRate = async (rating) => {
    if (!rating) return;
    setStatus("saving");
    setMessage("");
    try {
      const res = await fetch(`/api/ratings/${productId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setMessage("Please sign in to rate this product.");
          setStatus("error");
          return;
        }
        throw new Error(data?.error || "Unable to save rating");
      }
      setUserRating(rating);
      setStatus("saved");
      setMessage("Thanks for your rating!");
      await fetchRatings();
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "Unable to save rating");
    }
  };

  return (
    <section className="product-detail-section" aria-labelledby="product-feedback-heading">
      <h2 id="product-feedback-heading">Terminal Feedback</h2>

      <div className="product-feedback product-feedback--terminal">
        <div className="product-feedback__terminal-score" aria-label="Average rating">
          <div className="product-feedback__score-line">
            <span className="product-feedback__score">{summary.average.toFixed(1)}</span>
            <span className="product-feedback__score-max">/5</span>
          </div>
          <span className="product-star-rating" aria-hidden="true">
            {buildStars(summary.average).map((star) => (
              <i
                key={`summary-${star.value}`}
                className={`${star.isActive ? "fa-solid" : "fa-regular"} fa-star`}
              />
            ))}
          </span>
          <p className="product-feedback__verified">
            <i className="fa-solid fa-circle-check" aria-hidden="true" /> Verified
          </p>
        </div>

        <div className="product-feedback__terminal-panel">
          <div className="product-rating-input" role="radiogroup" aria-label={`Rate ${productName}`}>
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
                <i className={`${star.isActive ? "fa-solid" : "fa-regular"} fa-star`} aria-hidden="true" />
                <span className="sr-only">{`${star.value} star${star.value > 1 ? "s" : ""}`}</span>
              </button>
            ))}
          </div>

          <div className="product-rating-meta">
            {userRating ? (
              <p>System rating recorded: {userRating} / 5.</p>
            ) : (
              <p>{isLoggedIn ? "Tap a star to log a system rating for this product." : "Sign in to log a system rating for this product."}</p>
            )}
            {summary.totalRatings ? (
              <p className="product-feedback__terminal-count">{summary.totalRatings} verified ratings on record.</p>
            ) : null}
            {!isLoggedIn ? (
              <Link href={signInHref} className="product-rating-link">
                Sign in
              </Link>
            ) : null}
            {message ? <p className={`product-rating-message product-rating-message--${status}`}>{message}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
