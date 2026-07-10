"use client";

import { useEffect, useState } from "react";

const SCALE_TRIGGER_WIDTH = 620;
const SCALE_BASE_WIDTH = 620;
const SCALE_BASE_HEIGHT = 900;
const MIN_SCALE = 0.35;
const MAX_SCALE = 1;
const MAX_FOOTER_OFFSET = 56;

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export default function PageScaler({ children }) {
  const [scale, setScale] = useState(1);
  const [isScaling, setIsScaling] = useState(false);
  const [scaledMinHeight, setScaledMinHeight] = useState(SCALE_BASE_HEIGHT);
  const [footerOffset, setFooterOffset] = useState(0);
  const [supportsZoom, setSupportsZoom] = useState(false);

  useEffect(() => {
    if (typeof CSS === "undefined" || !CSS.supports) return;
    setSupportsZoom(CSS.supports("zoom", "1"));
  }, []);

  useEffect(() => {
    const updateScale = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const shouldScale = w <= SCALE_TRIGGER_WIDTH;

      if (!shouldScale) {
        setIsScaling(false);
        setScale(1);
        setScaledMinHeight(SCALE_BASE_HEIGHT);
        setFooterOffset(0);
        return;
      }

      const widthScale = w / SCALE_BASE_WIDTH;
      const nextScale = clamp(Math.min(widthScale, MAX_SCALE), MIN_SCALE, MAX_SCALE);
      const nextMinHeight = Math.max(SCALE_BASE_HEIGHT, Math.ceil(h / nextScale));
      const nextFooterOffset = Math.min(
        MAX_FOOTER_OFFSET,
        Math.max(0, Math.round((1 - nextScale) * 60))
      );

      setIsScaling(true);
      setScale(nextScale);
      setScaledMinHeight(nextMinHeight);
      setFooterOffset(nextFooterOffset);
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--page-scale", isScaling ? String(scale) : "1");
    root.style.setProperty("--page-scale-footer-offset", isScaling ? `${footerOffset}px` : "0px");
  }, [footerOffset, isScaling, scale]);

  return (
    <div
      className="page-scale-outer"
      style={{ display: "flex", justifyContent: "center" }}
    >
      <div
        className="page-scale-inner"
        style={{
          width: isScaling ? `${SCALE_BASE_WIDTH}px` : "100%",
          maxWidth: isScaling ? "none" : "100%",
          minHeight: isScaling ? `${scaledMinHeight}px` : "auto",
          transform: isScaling && !supportsZoom ? `scale(${scale})` : "none",
          transformOrigin: "top center",
          zoom: isScaling && supportsZoom ? scale : 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
