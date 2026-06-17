"use client";

import Link from "next/link";
import { useRef } from "react";

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export default function CategoryCarousel({
  cards,
  heading = "Browse categories",
  eyebrow,
  className = "",
  scrollAmount = 280,
  activeSlug,
}) {
  const headingId = `cc-${slugify(heading)}-${slugify(activeSlug || "all")}`;
  const viewportRef = useRef(null);
  const sectionClass = ["category-carousel", className].filter(Boolean).join(" ");

  const scroll = (offset) => {
    viewportRef.current?.scrollBy({ left: offset, behavior: "smooth" });
  };

  return (
    <section className={sectionClass} aria-labelledby={headingId}>
      <div className="category-carousel__header">
        <div className="category-carousel__title">
          {eyebrow ? <span className="category-carousel__eyebrow">{eyebrow}</span> : null}
          <h2 id={headingId}>{heading}</h2>
        </div>
        <div className="category-carousel__actions">
          <button
            type="button"
            className="category-carousel__arrow category-carousel__arrow--prev"
            onClick={() => scroll(-scrollAmount)}
            aria-label="Scroll categories left"
          >
            <svg viewBox="0 0 24 24" className="category-carousel__arrow-icon" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 18l-6-6 6-6" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="category-carousel__arrow category-carousel__arrow--next"
            onClick={() => scroll(scrollAmount)}
            aria-label="Scroll categories right"
          >
            <svg viewBox="0 0 24 24" className="category-carousel__arrow-icon" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 6l6 6-6 6" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="category-carousel__viewport" ref={viewportRef} role="presentation">
        <ul className="category-carousel__track" role="list">
          {cards.map((card) => {
            const key = card.slug ?? card.href ?? card.label;
            const isActive = activeSlug && card.slug === activeSlug;
            const cardClass = [
              "category-carousel__card",
              isActive ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={key} className="category-carousel__item">
                <Link
                  className={cardClass}
                  href={card.href}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="category-carousel__card-icon" aria-hidden="true">
                    <i className={`fa-solid ${card.icon}`} aria-hidden="true" />
                  </span>
                  <span className="category-carousel__card-label">{card.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
