"use client";

import { useEffect, useRef } from "react";

// Global scaler: wraps the whole app and scales from a base design width.
// Centered with translateX to avoid left/right drift; uses clientWidth for stable sizing.
export default function ScaledRoot({ baseWidth = 1200, minScale = 0.5, maxScale = 3, children }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const apply = () => {
      // Use container clientWidth (excludes scrollbar) for consistent scale at 1200px
      const vw = outer.clientWidth || outer.getBoundingClientRect().width || baseWidth;
      const raw = vw / baseWidth;
      const s = clamp(raw, minScale, maxScale);
      inner.style.setProperty("--scale", String(s));
      inner.style.setProperty("--base-width", `${baseWidth}px`);
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(outer);
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      ro.disconnect();
    };
  }, [baseWidth, minScale, maxScale]);

  return (
    <div ref={outerRef} className="scale-page-outer">
      <div ref={innerRef} className="scale-page-inner">
        {children}
      </div>
    </div>
  );
}
