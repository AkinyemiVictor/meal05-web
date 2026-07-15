"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const SCALE_TRIGGER_WIDTH = 620;
const SCALE_BASE_WIDTH = 620;
const SCALE_BASE_HEIGHT = 900;
const MIN_SCALE = 0.35;
const MAX_SCALE = 1;
const MAX_FOOTER_OFFSET = 56;

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function PageScaler({ children }) {
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [isScaling, setIsScaling] = useState(false);
  const [scaledDocHeight, setScaledDocHeight] = useState(SCALE_BASE_HEIGHT);
  const [footerOffset, setFooterOffset] = useState(0);

  useEffect(() => {
    const updateScale = () => {
      const width = window.innerWidth;
      const shouldScale = width <= SCALE_TRIGGER_WIDTH;

      if (!shouldScale) {
        setIsScaling(false);
        setScale(1);
        setScaledDocHeight(SCALE_BASE_HEIGHT);
        setFooterOffset(0);
        return;
      }

      const widthScale = width / SCALE_BASE_WIDTH;
      const nextScale = clamp(Math.min(widthScale, MAX_SCALE), MIN_SCALE, MAX_SCALE);
      const nextFooterOffset = Math.min(
        MAX_FOOTER_OFFSET,
        Math.max(0, Math.round((1 - nextScale) * 60))
      );

      setIsScaling(true);
      setScale(nextScale);
      setFooterOffset(nextFooterOffset);
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--page-scale", isScaling ? String(scale) : "1");
    root.style.setProperty("--page-scale-footer-offset", isScaling ? `${footerOffset}px` : "0px");
  }, [footerOffset, isScaling, scale]);

  useIsomorphicLayoutEffect(() => {
    if (!isScaling) return;

    const inner = innerRef.current;
    if (!inner) return;

    let rafId = 0;
    const measure = () => {
      const contentHeight = inner.scrollHeight || inner.getBoundingClientRect().height || SCALE_BASE_HEIGHT;
      const nextHeight = Math.max(window.innerHeight, Math.ceil(contentHeight * scale));
      setScaledDocHeight(nextHeight);
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleMeasure);
      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("resize", scheduleMeasure);
      };
    }

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(inner);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [isScaling, scale]);

  return (
    <div
      className="page-scale-outer"
      style={{
        position: "relative",
        width: "100%",
        height: isScaling ? `${scaledDocHeight}px` : "auto",
        minHeight: isScaling ? `${scaledDocHeight}px` : "100vh",
      }}
    >
      <div
        ref={innerRef}
        className="page-scale-inner"
        style={{
          width: isScaling ? `${SCALE_BASE_WIDTH}px` : "100%",
          maxWidth: isScaling ? "none" : "100%",
          position: isScaling ? "absolute" : "relative",
          top: 0,
          left: 0,
          right: isScaling ? "auto" : 0,
          marginInline: "0",
          transform: isScaling ? `scale(${scale})` : "none",
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
