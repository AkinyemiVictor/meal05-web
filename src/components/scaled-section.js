"use client";

import { useEffect, useRef } from "react";

// Proportional scaler for isolated, canvas-like sections.
// - Full-bleed wrapper (100vw) with dynamic height set from baseHeight * scale.
// - Centers horizontally using left:50% + translateX(-50%).
// - Prevents upscaling beyond 1x by default.
export default function ScaledSection({
  baseWidth = 1440,
  baseHeight = null,
  maxScale = 1,
  className = "",
  style = {},
  children,
}) {
  const wrapperRef = useRef(null);
  const innerRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const inner = innerRef.current;
    if (!wrapper || !inner) return;

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    function applyScale() {
      const w = wrapper.clientWidth || 1;
      const raw = w / baseWidth;
      const s = clamp(raw, 0, maxScale ?? 1);
      inner.style.setProperty("--s", String(s));
      const contentHeight = baseHeight ?? inner.scrollHeight;
      wrapper.style.height = `${Math.ceil(contentHeight * s)}px`;
    }

    // Initial paint
    applyScale();

    // Observe wrapper size
    const ro = new ResizeObserver(applyScale);
    ro.observe(wrapper);
    ro.observe(inner);

    // Fallback on window resize
    window.addEventListener("resize", applyScale);
    return () => {
      window.removeEventListener("resize", applyScale);
      ro.disconnect();
    };
  }, [baseWidth, baseHeight, maxScale]);

  return (
    <div ref={wrapperRef} className={`scale-wrapper ${className}`} style={style}>
      <div ref={innerRef} className="scale-inner" style={{ width: baseWidth, ...(baseHeight ? { height: baseHeight } : {}) }}>
        {children}
      </div>
    </div>
  );
}
