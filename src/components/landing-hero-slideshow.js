"use client";

import { useEffect, useState } from "react";

const SLIDE_INTERVAL_MS = 5000;
const PORTRAIT_BREAKPOINT = "(max-width: 1080px)";

const slides = [
  {
    landscape: "/assets/billboard/hero-slides/slide-1-landscape.jpeg",
    portrait: "/assets/billboard/hero-slides/slide-1-portrait.jpeg",
    alt: "Meal05 team sorting fresh green beans",
  },
  {
    landscape: "/assets/billboard/hero-slides/slide-2-landscape.jpeg",
    portrait: "/assets/billboard/hero-slides/slide-2-portrait.jpeg",
    alt: "Fresh onions being sorted at a Meal05 facility",
  },
  {
    landscape: "/assets/billboard/hero-slides/slide-3-landscape.jpeg",
    portrait: "/assets/billboard/hero-slides/slide-3-portrait.jpeg",
    alt: "Market vendor serving fresh produce",
  },
  {
    landscape: "/assets/billboard/hero-slides/slide-4-landscape.jpeg",
    portrait: "/assets/billboard/hero-slides/slide-4-portrait.jpeg",
    alt: "Fresh cassava and produce at a local market stall",
  },
];

export default function LandingHeroSlideshow() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPortraitLayout, setIsPortraitLayout] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(PORTRAIT_BREAKPOINT);
    const updateLayout = () => setIsPortraitLayout(mediaQuery.matches);

    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const nextSlide = slides[(activeSlide + 1) % slides.length];
    const image = new window.Image();
    image.src = isPortraitLayout ? nextSlide.portrait : nextSlide.landscape;
  }, [activeSlide, isPortraitLayout]);

  return (
    <div className="landing-hero-slideshow" aria-label="Meal05 market imagery">
      {slides.map((slide, index) => (
        <picture
          className={`landing-hero-slideshow__slide${index === activeSlide ? " is-active" : ""}`}
          key={slide.landscape}
        >
          <source media={PORTRAIT_BREAKPOINT} srcSet={slide.portrait} />
          <img
            src={slide.landscape}
            alt={index === activeSlide ? slide.alt : ""}
            decoding="async"
            fetchPriority={index === 0 ? "high" : "auto"}
          />
        </picture>
      ))}
    </div>
  );
}
